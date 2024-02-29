import EventEmitter from 'events';

const eventEmitter = new EventEmitter();

const log = (type: string, message: string | number | Record<string, any>) => {
    let msg = message;
    if (typeof message === 'object') msg = JSON.stringify(msg);

    eventEmitter.emit(type, `[MCLC]: ${msg}`);
    return;
};

const onLog = (type: string, callback: (message: string) => void) => {
    eventEmitter.on(type, callback);
    return;
};

export { log, onLog };
