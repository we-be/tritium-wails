import './style.css';
import './app.css';
import logo from './assets/images/logo-universal.png';
import {GetValue, SetValue} from '../wailsjs/go/main/App';

document.querySelector('#app').innerHTML = `
    <div class="sidebar">
        <img id="logo" class="logo">
        <button class="add-button" onclick="showSetDialog()">+</button>
    </div>
    <div class="main-content">
        <div class="content-area">
            <div id="result" class="result">Select a key to get its value</div>
        </div>
        <div class="bottom-pane">
            <input class="input" id="keyInput" type="text" autocomplete="off" placeholder="Enter key..." />
            <button class="btn" onclick="getValue()">Get</button>
        </div>
    </div>
`;

document.getElementById('logo').src = logo;
let keyElement = document.getElementById("keyInput");
let resultElement = document.getElementById("result");

keyElement.focus();

// Setup the getValue function
window.getValue = function () {
    let key = keyElement.value;
    if (key === "") return;
    
    try {
        GetValue(key)
            .then((result) => {
                resultElement.innerText = result;
            })
            .catch((err) => {
                console.error(err);
                resultElement.innerText = "Error: " + err;
            });
    } catch (err) {
        console.error(err);
        resultElement.innerText = "Error: " + err;
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
                closeModal();
            })
            .catch((err) => {
                console.error(err);
                resultElement.innerText = "Error: " + err;
            });
    };
};