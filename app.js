document.addEventListener('DOMContentLoaded', () => {
    // Authentication Check and Bootstrapping
    const token = localStorage.getItem('et_token');
    const username = localStorage.getItem('et_user');
    
    if (!token) {
        window.location.href = 'auth.html';
        return;
    }

    // Set UI User
    document.getElementById('nav-username').innerText = username.toUpperCase();
    document.getElementById('nav-avatar').innerText = username.charAt(0).toUpperCase();

    // Logout Logic
    document.getElementById('btn-logout').onclick = () => {
        localStorage.removeItem('et_token');
        localStorage.removeItem('et_user');
        window.location.href = 'auth.html';
    };

    // Tab Switching Logic
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Swarm Visualizer Animation Logic
    const nodes = [
        document.getElementById('node-sentinel'),
        document.getElementById('node-analyst'),
        document.getElementById('node-strategist'),
        document.getElementById('node-guardrail'),
        document.getElementById('node-messenger')
    ];
    const edges = document.querySelectorAll('.edge');

    function resetSwarm() {
        nodes.forEach(n => n.classList.remove('active', 'processing'));
        edges.forEach(e => e.classList.remove('active'));
    }

    function animateSwarmSequence() {
        resetSwarm();
        let step = 0;
        nodes[0].classList.add('active', 'processing');

        const interval = setInterval(() => {
            nodes[step].classList.remove('processing');
            if (step < edges.length) {
                edges[step].classList.add('active');
            }
            step++;
            if (step < nodes.length) {
                nodes[step].classList.add('active', 'processing');
            } else {
                clearInterval(interval);
                // Fix: Do not repeat animation endlessly. Just leave the last node illuminated.
                nodes[nodes.length - 1].classList.remove('processing');
            }
        }, 1200);
    }
    animateSwarmSequence();

    // Active Users Logic
    async function fetchActiveUsers() {
        try {
            const res = await fetch('http://localhost:8000/api/active_users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const users = await res.json();
            
            document.getElementById('online-count').innerText = users.length;
            const listDiv = document.getElementById('active-users-list');
            listDiv.innerHTML = '';
            
            users.forEach(u => {
                listDiv.innerHTML += `
                    <div class="online-user">
                        <div class="dot"></div>
                        <span style="color:var(--text-muted)">OP:</span>
                        <span>${u.username.toUpperCase()}</span>
                    </div>
                `;
            });
        } catch(e) {
            console.log("Could not fetch active users");
        }
    }
    // Fetch immediately and poll every 30s
    fetchActiveUsers();
    setInterval(fetchActiveUsers, 30000);

    // Mock Data Generator for Radar Feed
    const radarFeed = document.getElementById('radar-feed');
    const mockSignals = [
        {
            title: "HDFC Bank Block Deal Confirmed",
            traceId: "TRC-9921",
            confidence: "99.1%",
            snippet: "The Vanguard Group purchased 4,500,000 equity shares at ₹1645.00 via Block Deal window on NSE.",
            time: "Just now"
        },
        {
            title: "Reliance Promoter Acquisition",
            traceId: "TRC-9920",
            confidence: "98.5%",
            snippet: "Promoter group acquired 1,20,000 shares from open market. Form C filing verified.",
            time: "6 mins ago"
        },
        {
            title: "TCS Management Commentary Shift",
            traceId: "TRC-9919",
            confidence: "87.4%",
            snippet: "Q3 Earnings Call: 'We see unanticipated margin compression in the BFSI vertical due to macro headwinds...'",
            time: "14 mins ago"
        },
        {
            title: "SEBI Circular on F&O Margins",
            traceId: "TRC-9918",
            confidence: "94.2%",
            snippet: "Regulatory update: Required margin for index options to increase by 5% effective next trading session.",
            time: "42 mins ago"
        }
    ];

    function createSignalCard(signal) {
        return `
            <div class="signal-card new">
                <div class="signal-header">
                    <div class="signal-title"><span style="color:var(--text-muted); font-size:11px">${signal.time}</span></div>
                    <div class="signal-meta">
                        <span class="trace-id">${signal.traceId}</span>
                        <span class="confidence">${signal.confidence} Conf</span>
                    </div>
                </div>
                <div class="signal-body mt-2">
                    <h3>${signal.title}</h3>
                    <div class="source-snippet mt-2">${signal.snippet}</div>
                </div>
            </div>
        `;
    }
    let renderHTML = '';
    mockSignals.forEach(s => renderHTML += createSignalCard(s));
    radarFeed.innerHTML = renderHTML;

    // Strategist Chat & API Integration
    const chatInput = document.getElementById('chat-input');
    const chatSubmit = document.getElementById('chat-submit');
    const chatHistory = document.getElementById('chat-history');
    const portfolioContext = "User holds 12% in Banking, target is 20%. Holds 45% Tech.";

    function appendMessage(role, content, cite = '', meta = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        
        if (role === 'system') {
            msgDiv.innerHTML = `
                <div class="compliance-badge-container">
                    <div class="compliance-badge">Compliance Guardrail Active</div>
                </div>
                <p class="text-muted" style="font-size: 13px;">[SYSTEM] ${content}</p>
            `;
            msgDiv.style.alignSelf = 'center';
            msgDiv.style.textAlign = 'center';
            msgDiv.style.maxWidth = '100%';
            msgDiv.style.background = 'transparent';
            msgDiv.style.border = 'none';
        } else if (role === 'user') {
            msgDiv.innerHTML = `
                <div class="msg-header" style="color:var(--action-teal)">${username.toUpperCase()} [You]</div>
                <p style="font-size:14px; color:#fff;">${content}</p>
            `;
            msgDiv.style.alignSelf = 'flex-end';
            msgDiv.style.background = 'rgba(0, 242, 255, 0.05)';
            msgDiv.style.borderRight = '2px solid var(--action-teal)';
            msgDiv.style.border = '1px solid rgba(0, 242, 255, 0.1)';
            msgDiv.style.borderRightWidth = '3px';
            msgDiv.style.borderRadius = '12px';
        } else if (role === 'ai') {
            let metaHtml = meta ? `<div class="mt-2 text-muted" style="font-size: 11px; margin-top:16px;">[Trace ID: ${meta.traceId} | Confirm: ${meta.confidence}%]</div>` : '';
            let citeHtml = cite ? `<span class="cite-chip">${cite}</span>` : '';
            
            msgDiv.innerHTML = `
                <div class="msg-header">The Strategist ${citeHtml}</div>
                <p>${content}</p>
                ${metaHtml}
                <p class="compliance-warning" style="font-size: 11px; color: var(--accent-emerald); font-style: italic; margin-top:8px;">
                    Analytical Observation: Please consider your specific risk profile.
                </p>
            `;
        }
        
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    if (chatSubmit && chatInput) {
        // Create initial system message to match previous state
        appendMessage('system', 'Ingesting validated Signal (ID: TRC-9921)... Pulling User Portfolio State.');
        appendMessage('ai', 'Signal <strong>TRC-9921</strong> describes a 4.5M equity block deal in HDFC Bank by Vanguard. Validation confirms a Bullish Breakout from a 2-week consolidation zone. <br><br>Portfolio Context: Your current Banking sector weight is 12% (target: 20%).<br><br>Analytical Observation: The setup presents a favorable fundamental/technical alignment. Note: This assumes macro rates remain stable.', '[Ref 1] NSE Bulk Deal CSV');

        chatSubmit.addEventListener('click', async () => {
            const query = chatInput.value.trim();
            if (!query) return;

            let ticker = "RELIANCE";
            const words = query.split(' ');
            if (query.toUpperCase().includes('HDFC')) ticker = "HDFCBANK";
            else if (query.toUpperCase().includes('TCS')) ticker = "TCS";
            else if (words[0] === words[0].toUpperCase() && words[0].length >= 3) ticker = words[0];

            appendMessage('user', query);
            chatInput.value = '';

            appendMessage('system', 'Intercepting query... fetching live OHLCV data & reasoning with context.');

            try {
                const response = await fetch('http://localhost:8000/api/query', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        ticker: ticker,
                        question: query,
                        portfolio_context: portfolioContext
                    })
                });

                if (!response.ok) {
                    if (response.status === 401) {
                         document.getElementById('btn-logout').click();
                    }
                    throw new Error("API Error");
                }
                const data = await response.json();

                chatHistory.removeChild(chatHistory.lastChild);

                appendMessage('ai', data.answer, '[Ref: yfinance/NSE]', {
                    traceId: data.traceability_id,
                    confidence: data.confidence_score
                });

            } catch (err) {
                chatHistory.removeChild(chatHistory.lastChild);
                appendMessage('system', 'Connection to Intelligence Engine failed. Ensure local FastAPI backend is running on port 8000.');
            }
        });

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') chatSubmit.click();
        });
    }
});
