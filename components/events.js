const event = new (require('events')).EventEmitter();
event.on('newListener', event => {
    if(event === 'start') {
        process.emitWarning('The \'start\' event is deprecated. Use \'data\' instead.', 'DeprecationWarning');
    }
});
module.exports = event;