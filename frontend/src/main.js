import './style.css';
import './app.css';
import logo from './assets/images/logo-universal.png';
import {GetValue, SetValue, UpdateConnection} from '../wailsjs/go/main/App';

// Command history storage
let commandHistory = [];
let currentConnection = {
    address: 'localhost',
    port: '41739',
    status: 'disconnected'
};

document.querySelector('#app').innerHTML = `
    <div class="topbar">
        <div class="tabs">
            <button class="tab active" onclick="switchTab(event, 'result')">Result</button>
            <button class="tab" onclick="switchTab(event, 'history')">History</button>
            <button class="tab" onclick="switchTab(event, 'connections')">Connections</button>
        </div>
    </div>
    <div class="main-container">
        <div class="sidebar">
            <img id="logo" class="logo">
        </div>
        <div class="main-content">
            <div class="content-area" id="content-area">
                <div class="result-view">
                    <div id="result" class="result">Select a key to get its value</div>
                </div>
            </div>
            <div class="bottom-pane">
                <button class="add-button" onclick="showSetDialog()">+</button>
                <input class="input" id="keyInput" type="text" autocomplete="off" placeholder="Enter key..." />
                <button class="btn" onclick="getValue()">Get</button>
            </div>
        </div>
    </div>
`;

document.getElementById('logo').src = logo;
let keyElement = document.getElementById("keyInput");
let resultElement = document.getElementById("result");

keyElement.focus();

// Setup tab switching
window.switchTab = function(event, tab) {
    // Update tab styling
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }

    // Update content
    const contentArea = document.getElementById('content-area');
    
    switch(tab) {
        case 'history':
            contentArea.innerHTML = `
                <table class="history-table">
                    <tbody>
                        ${commandHistory.map(cmd => `
                            <tr>
                                <td>${cmd}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            break;
            
        case 'connections':
            contentArea.innerHTML = `
                <div class="connection-form">
                    <div class="connection-status">
                        <div class="status-indicator ${currentConnection.status}"></div>
                        <span style="color: #8b949e">
                            ${currentConnection.status === 'connected' ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <div class="form-group">
                        <label>Address</label>
                        <input 
                            class="input" 
                            id="addressInput" 
                            type="text" 
                            value="${currentConnection.address}"
                            style="width: 100%; box-sizing: border-box;"
                        >
                    </div>
                    <div class="form-group">
                        <label>Port</label>
                        <input 
                            class="input" 
                            id="portInput" 
                            type="text" 
                            value="${currentConnection.port}"
                            style="width: 100%; box-sizing: border-box;"
                        >
                    </div>
                    <button class="btn" onclick="updateConnection()" style="width: 100%">
                        Connect
                    </button>
                </div>
            `;
            break;
            
        default: // Result tab
            contentArea.innerHTML = `
                <div class="result-view">
                    <div id="result" class="result">${resultElement.innerText}</div>
                </div>
            `;
            resultElement = document.getElementById("result");
    }
};

// Update connection settings
window.updateConnection = function() {
    const address = document.getElementById('addressInput').value;
    const port = document.getElementById('portInput').value;
    
    if (!address || !port) {
        alert('Please provide both address and port');
        return;
    }

    UpdateConnection(address, port)
        .then((result) => {
            currentConnection = {
                address,
                port,
                status: 'connected'
            };
            commandHistory.unshift(`CONNECT ${address}:${port} → ${result}`);
            switchTab(null, 'connections'); // Refresh the connection view
        })
        .catch((err) => {
            currentConnection.status = 'disconnected';
            commandHistory.unshift(`CONNECT ${address}:${port} → Error: ${err}`);
            switchTab(null, 'connections');
        });
};

// Setup the getValue function
window.getValue = function () {
    let key = keyElement.value;
    if (key === "") return;
    
    try {
        GetValue(key)
            .then((result) => {
                resultElement.innerText = result;
                commandHistory.unshift(`GET ${key} → ${result}`);
                keyElement.value = "";
                keyElement.focus();
            })
            .catch((err) => {
                console.error(err);
                resultElement.innerText = "Error: " + err;
                commandHistory.unshift(`GET ${key} → Error: ${err}`);
            });
    } catch (err) {
        console.error(err);
        resultElement.innerText = "Error: " + err;
        commandHistory.unshift(`GET ${key} → Error: ${err}`);
    }
};

// Function to show the set dialog
window.showSetDialog = function() {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

    // Create modal content
    const content = document.createElement('div');
    content.style.cssText = `
        background: #161b22;
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #30363d;
        width: 300px;
    `;

    content.innerHTML = `
        <h3 style="margin-top: 0; color: #c9d1d9; margin-bottom: 15px;">Add New Key-Value Pair</h3>
        <input class="input" id="modalKeyInput" type="text" placeholder="Enter key..." style="width: 100%; margin-bottom: 10px; box-sizing: border-box;">
        <input class="input" id="modalValueInput" type="text" placeholder="Enter value..." style="width: 100%; margin-bottom: 15px; box-sizing: border-box;">
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn" onclick="closeModal()">Cancel</button>
            <button class="btn" onclick="submitValue()">Save</button>
        </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Focus the key input
    document.getElementById('modalKeyInput').focus();

    // Setup close modal function
    window.closeModal = function() {
        document.body.removeChild(modal);
    };

    // Setup submit function
    window.submitValue = function() {
        const key = document.getElementById('modalKeyInput').value;
        const value = document.getElementById('modalValueInput').value;

        if (key === "" || value === "") {
            return;
        }

        SetValue(key, value)
            .then((result) => {
                resultElement.innerText = result;
                commandHistory.unshift(`SET ${key} ${value} → ${result}`);
                closeModal();
            })
            .catch((err) => {
                console.error(err);
                resultElement.innerText = "Error: " + err;
                commandHistory.unshift(`SET ${key} ${value} → Error: ${err}`);
            });
    };
};