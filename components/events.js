const event = new (require('events')).EventEmitter();
event.on('newListener', event => {
    if(event === 'start') {
        process.emitWarning('The \'start\' event has been removed. Use \'data\' instead.', 'DeprecationWarning');
    }
});
module.exports = event;