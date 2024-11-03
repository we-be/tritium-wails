import './style.css';
import './app.css';
import logo from './assets/images/logo-universal.png';
import {GetValue} from '../wailsjs/go/main/App';

document.querySelector('#app').innerHTML = `
    <div class="sidebar">
        <img id="logo" class="logo">
    </div>
    <div class="main-content">
        <div class="result" id="result">Enter a key to get a value</div>
        <div class="input-box" id="input">
            <input class="input" id="name" type="text" autocomplete="off" placeholder="Enter key..." />
            <button class="btn" onclick="greet()">Get</button>
        </div>
    </div>
`;

document.getElementById('logo').src = logo;
let nameElement = document.getElementById("name");
nameElement.focus();
let resultElement = document.getElementById("result");

// Setup the greet function
window.greet = function () {
    // Get name
    let name = nameElement.value;
    // Check if the input is empty
    if (name === "") return;
    // Call App.Greet(name)
    try {
        GetValue(name)
            .then((result) => {
                // Update result with data back from App.Greet()
                resultElement.innerText = result;
            })
            .catch((err) => {
                console.error(err);
            });
    } catch (err) {
        console.error(err);
    }
};