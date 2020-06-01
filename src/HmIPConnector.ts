import * as os from "os";
import * as crypto from "crypto"
import fetch from "node-fetch"
import WebSocket from "ws";

interface LookUpResult {
    urlREST: string;
    urlWebSocket: string;
}

export class HmIPConnector {

    private readonly authToken: string;
    private readonly clientAuthToken: string;
    private readonly clientCharacteristics: string;

    private urlREST!: string;
    private urlWebSocket!: string;

    constructor(accessPoint: string, authToken: string) {
        this.authToken = authToken;
        this.clientCharacteristics = JSON.stringify({
            "clientCharacteristics":
                {
                    "apiVersion": "10",
                    "applicationIdentifier": "homebridge-homematicip",
                    "applicationVersion": "0.0.1",
                    "deviceManufacturer": "none",
                    "deviceType": "Computer",
                    "language": "de_DE",
                    "osType": os.type(),
                    "osVersion": os.release()
                },
            "id": accessPoint
        });

        this.clientAuthToken = crypto
            .createHash('sha512')
            .update(accessPoint + "jiLpVitHvWnIGD1yo7MA")
            .digest('hex')
            .toUpperCase();
    }

    async init() {
        const response = await fetch("https://lookup.homematic.com:48335/getHost", {
            method: "POST",
            body: this.clientCharacteristics
        });
        const result = <LookUpResult>await response.json();
        this.urlREST = result.urlREST;
        this.urlWebSocket = result.urlWebSocket;
    }

    async apiCall<T>(path: string, _body?: object) {
        const response = await fetch(`${this.urlREST}/hmip/${path}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "accept": "application/json",
                "VERSION": "12",
                "AUTHTOKEN": this.authToken,
                "CLIENTAUTH": this.clientAuthToken
            },
            body: _body ? JSON.stringify(_body) : this.clientCharacteristics
        });

        if (response.headers.get("Content-Type") === "application/json") {
            return <T>await response.json();
        } else {
            return true;
        }
    }

    async connectWs(listener: (this: WebSocket, data: WebSocket.Data) => void) {
        const ws = new WebSocket(this.urlWebSocket, {
            headers: {
                "AUTHTOKEN": this.authToken,
                "CLIENTAUTH": this.clientAuthToken,
            }
        });

        ws.on("message", listener);

        ws.on("open", () => {
            console.log("WS connected.");
        })

        ws.on("close", () => {
            console.log("WS closed.");
        })
    }

}