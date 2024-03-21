class Counter {
    value: number;

    constructor() {
        this.value = 0;
    }

    increment() {
        this.value++;
    }

    reset() {
        this.value = 0;
    }

    getValue() {
        return this.value;
    }
}

export default Counter;
