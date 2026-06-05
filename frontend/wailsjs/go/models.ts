export namespace main {
	
	export class Connection {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    username: string;
	    password?: string;
	    authMethod: string;
	    privateKey?: string;
	    passphrase?: string;
	    os?: string;
	
	    static createFrom(source: any = {}) {
	        return new Connection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.authMethod = source["authMethod"];
	        this.privateKey = source["privateKey"];
	        this.passphrase = source["passphrase"];
	        this.os = source["os"];
	    }
	}

}

