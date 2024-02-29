import EventEmitter from 'events';

const eventEmitter = new EventEmitter();

const log = (type: string, message: any) => {
    eventEmitter.emit(type, `[MCLC]: ${message}`);
    return;
};

const onLog = (type: string, callback: (message: string) => void) => {
    eventEmitter.on(type, callback);
    return;
};

export { log, onLog };
