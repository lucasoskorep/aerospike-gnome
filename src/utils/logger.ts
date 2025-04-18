export class Logger {

    static fatal(...args: any[]) {
        console.log(`[Aerospike] [FATAL]`, ...args);
    }

    static error(...args: any[]) {
        console.log(`[Aerospike] [ERROR]`, ...args);
    }

    static warn(...args: any[]) {
        console.log(`[Aerospike] [WARN]`, ...args);
    }

    static info(...args: any[]) {
        console.log(`[Aerospike] [INFO]`, ...args);
    }

    static debug(...args: any[]) {
        console.log(`[Aerospike] [DEBUG]`, ...args);
    }

    static trace(...args: any[]) {
        console.log(`[Aerospike] [TRACE]`, ...args);
    }

    static log(...args: any[]) {
        console.log(`[Aerospike] [LOG]`, ...args);
    }
}
