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
	    node: string;
	    tls: boolean;
	    encrypted: boolean;
	}
	export class Node {
	    id: string;
	    addr: string;
	    state: string;
	    version: string;
	    seeds: string;
	    replicas: string;
	    lastSeen: string;
	    conns: number;
	    bytes: number;
	    weight: number;
	    keys: number;
	    memory: number;
	    writes: number;
	}
	export class ScanKey {
	    name: string;
	    type: string;
	    ttl: number;
	}
	export class ScanResult {
	    keys: ScanKey[];
	    next: number;
	}
	export class Event {
	    at: number;
	    node: string;
	    event: string;
	    peer: string;
	    keys: number;
	    took: number;
	}
	export class Value {
	    type: string;
	    text: string;
	    count: number;
	}
}
