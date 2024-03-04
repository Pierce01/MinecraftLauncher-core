import EventEmitter from 'events';

const eventEmitter = new EventEmitter();

const log = (type: string, message: string | number | Record<string, any>) => {
    const msg = typeof message === 'object' ? JSON.stringify(message) : message;
    eventEmitter.emit(type, type !== 'data' ? `[MCLC]: ${msg}` : msg);
    return;
};

const onLog = (type: string, callback: (message: string) => void) => {
    eventEmitter.on(type, callback);
    return;
};

export { log, onLog };
