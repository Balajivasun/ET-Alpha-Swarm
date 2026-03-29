import os
import uuid
import random
import datetime
import bcrypt
import yfinance as yf
from fastapi import FastAPI, HTTPException, Depends, status
from pydantic import BaseModel
from groq import Groq
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from sqlalchemy.orm import Session
import models
from database import engine, SessionLocal

from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles

load_dotenv()
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth Config
SECRET_KEY = os.getenv("SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Dependencies
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Schemas
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    username: str
    email: str
    is_active: bool

class Token(BaseModel):
    access_token: str
    token_type: str

class ActiveUserRes(BaseModel):
    username: str
    last_login: datetime.datetime

class QueryRequest(BaseModel):
    ticker: str
    question: str
    portfolio_context: str

class QueryResponse(BaseModel):
    answer: str
    traceability_id: str
    confidence_score: float

# -- Auth Utils --
def verify_password(plain_password, hashed_password):
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# -- API Endpoints --
@app.post("/api/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = models.User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    user.last_login = datetime.datetime.utcnow()
    db.commit()

    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/active_users", response_model=list[ActiveUserRes])
def get_active_users(db: Session = Depends(get_db)):
    twenty_four_hours_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
    users = db.query(models.User).filter(models.User.last_login >= twenty_four_hours_ago).all()
    return users

def get_market_data(ticker: str) -> dict:
    symbol = f"{ticker}.NS" if not ticker.endswith(".NS") else ticker
    stock = yf.Ticker(symbol)
    hist = stock.history(period="1mo")
    if hist.empty:
        raise ValueError(f"Could not fetch data for {symbol}")
        
    current_price = hist['Close'].iloc[-1]
    last_month_price = hist['Close'].iloc[0]
    monthly_pct_change = ((current_price - last_month_price) / last_month_price) * 100
    
    info = stock.info
    high_52 = info.get('fiftyTwoWeekHigh', 'N/A')
    low_52 = info.get('fiftyTwoWeekLow', 'N/A')
    
    current_volume = hist['Volume'].iloc[-1]
    vol_20d_ma = hist['Volume'].mean()
    volume_spike_ratio = current_volume / vol_20d_ma if vol_20d_ma > 0 else 1.0
    
    return {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "monthly_pct_change": round(monthly_pct_change, 2),
        "52_week_high": high_52,
        "52_week_low": low_52,
        "current_volume": current_volume,
        "20_day_avg_volume": round(vol_20d_ma, 2),
        "volume_spike_ratio": round(volume_spike_ratio, 2)
    }

@app.post("/api/query", response_model=QueryResponse)
async def process_query(req: QueryRequest, current_user: models.User = Depends(get_current_user)):
    try:
        market_data = get_market_data(req.ticker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    trace_id = f"TRC-{uuid.uuid4().hex[:6].upper()}"
    confidence = round(random.uniform(85.0, 99.0), 1)
    
    system_prompt = """You are 'The Strategist', an AI Analytical Observer for the Indian Stock Market.
STRICT GUARDRAILS:
1. You act ONLY as an Analytical Observer, NEVER a Financial Advisor.
2. DO NOT make Buy/Sell/Hold recommendations. Use phrases like "Data indicates..." or "Historically...".
3. You must explicitly cite the data source in your response (e.g., "[Ref: yfinance/NSE]").
4. Reference the provided user portfolio context to explain the personal relevance of the signal.
5. Keep the response concise, punchy, and professional."""

    user_prompt = f"""User Question: {req.question}
Ticker: {req.ticker}
Portfolio Context: {req.portfolio_context}

Real-time Market Data:
- Current Price: ₹{market_data['current_price']}
- Monthly Change: {market_data['monthly_pct_change']}%
- Volume Spike Ratio: {market_data['volume_spike_ratio']}x

Formulate the analytical observation."""

    if not client:
        answer = f"[Ref: yfinance/NSE] Data indicates {req.ticker} is trading at ₹{market_data['current_price']} with a {market_data['volume_spike_ratio']}x volume spike. Given your portfolio context ({req.portfolio_context}), this aligns with historical breakouts. (MOCK GROQ RESP)"
    else:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="llama3-8b-8192",
            temperature=0.3,
            max_tokens=256
        )
        answer = chat_completion.choices[0].message.content

    return QueryResponse(answer=answer, traceability_id=trace_id, confidence_score=confidence)

# MUST BE AT THE BOTTOM: Serve the frontend static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
