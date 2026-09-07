export namespace main {
	export class Settings {
	    address: string;
	    password: string;
	    tls: boolean;
	    ca: string;
	    key: string;
	    envFile: string;
	}
	export class Status {
	    connected: boolean;
	    address: string;
	    tls: boolean;
	    encrypted: boolean;
	}
	export class Node {
	    id: string;
	    addr: string;
	    store: string;
	    state: string;
	    seed: boolean;
	    version: string;
	    seeds: string;
	    replicas: string;
	    lastSeen: string;
	    conns: number;
	    bytes: number;
	}
}
