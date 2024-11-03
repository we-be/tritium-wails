import './style.css';
import './app.css';
import logo from './assets/images/logo-universal.png';
import {GetValue, SetValue} from '../wailsjs/go/main/App';

document.querySelector('#app').innerHTML = `
    <div class="sidebar">
        <img id="logo" class="logo">
    </div>
    <div class="main-content">
        <div class="result" id="result">Enter a key and value</div>
        <div class="input-box" id="input">
            <input class="input" id="keyInput" type="text" autocomplete="off" placeholder="Enter key..." />
            <input class="input" id="valueInput" type="text" autocomplete="off" placeholder="Enter value..." />
            <button class="btn" onclick="setValue()">Set</button>
            <button class="btn" onclick="getValue()">Get</button>
        </div>
    </div>
`;

document.getElementById('logo').src = logo;
let keyElement = document.getElementById("keyInput");
let valueElement = document.getElementById("valueInput");
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

// Setup the setValue function
window.setValue = function () {
    let key = keyElement.value;
    let value = valueElement.value;
    if (key === "" || value === "") {
        resultElement.innerText = "Please enter both key and value";
        return;
    }
    
    try {
        SetValue(key, value)
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