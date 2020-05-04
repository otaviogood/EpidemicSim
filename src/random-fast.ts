// Fast random number and hashing algorithms from https://www.shadertoy.com/view/wljXDz
export default class RandomFast {
    randomState = 4056649889;
    constructor(seed: number) {
        this.randomState = seed;
    }

    // 0xffffff is biggest 2^n-1 that 32 bit float does exactly.
    // Check with Math.fround(0xffffff) in javascript.
    static invMax24Bit = 1.0 / Number(0xffffff);

    // This is the main hash function that should produce a non-repeating
    // pseudo-random sequence for 2^31 iterations.
    static SmallHashA(seed: number): number {
        return ((seed ^ 1057926937) * 3812423987) ^ (seed * seed * 4000000007);
    }
    // This is an extra hash function to clean things up a little.
    static SmallHashB(seed: number): number {
        return (seed ^ 2156034509) * 3699529241;
    }

    // Hash the random state to get a random float ranged [0..1]
    RandFloat(): number {
        this.randomState = RandomFast.SmallHashA(this.randomState);
        // Add these 2 lines for extra randomness. And change last line to tempState.
        let tempState = (this.randomState << 13) | (this.randomState >> 19);
        tempState = RandomFast.SmallHashB(tempState);
        return Number((tempState >> 8) & 0xffffff) * RandomFast.invMax24Bit;
    }

    // This will be biased...
    RandIntApprox(a:number, b:number) {
        if (b-a > 2000000) alert("random range too big");
        this.randomState = RandomFast.SmallHashA(this.randomState);
        // Add these 2 lines for extra randomness. And change last line to tempState.
        let tempState = (this.randomState << 13) | (this.randomState >> 19);
        tempState = RandomFast.SmallHashB(tempState) | 0;
        b |= 0;
        a |= 0;
        return (Math.abs(tempState >> 10) % (b - a)) + a;
    }

    static HashInt32(seed:number) {
        seed = RandomFast.SmallHashA(seed);
        // Add these 2 lines for extra randomness. And change last line to tempState.
        let tempState = (seed << 13) | (seed >> 19);
        tempState = RandomFast.SmallHashB(tempState) | 0;
        return tempState;
    }

    // This will be biased...
    // range is from [a..b) --> b is not included
    static HashIntApprox(seed:number, fromInclusive:number, toExclusive:number) {
        if (toExclusive-fromInclusive > 2000000) alert("has range too big");
        seed = RandomFast.SmallHashA(seed);
        // Add these 2 lines for extra randomness. And change last line to tempState.
        let tempState = (seed << 13) | (seed >> 19);
        tempState = RandomFast.SmallHashB(tempState) | 0;
        toExclusive |= 0;
        fromInclusive |= 0;
        return (Math.abs(tempState >> 10) % (toExclusive - fromInclusive)) + fromInclusive;
    }

    static HashI2(seedx:number, seedy:number) {
        let seed = RandomFast.SmallHashA((seedx | 0) ^ ((seedy | 0) * 65537));
        let tempState = (seed << 13) | (seed >> 19);
        return RandomFast.SmallHashB(tempState) | 0;
    }

    // Returns a random float from [0..1]
    static HashFloat(seed: number): number {
        seed = RandomFast.SmallHashA(seed);
        return ((seed >> 8) & 0xffffff) * RandomFast.invMax24Bit;
    }
    static HashString(s: string): number {
        let hash = 0,
            i,
            chr;
        if (s.length === 0) return hash;
        for (i = 0; i < s.length; i++) {
            chr = s.charCodeAt(i);
            hash ^= RandomFast.SmallHashA(chr);
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }

    static ToRGB(seed:number) {
        let a = seed | 0;
        return "rgb(" + (Math.max(a & 0xff, 190)|0).toFixed(0) + "," + ((a >> 8) & 0xff).toFixed(0) + "," + ((a >> 16) & 0xff).toFixed(0) +")";
    }
    static HashRGB(seed:number) {
        let a = RandomFast.SmallHashA(seed);
        return "rgb(" + (Math.max(a & 0xff, 190)|0).toFixed(0) + "," + ((a >> 8) & 0xff).toFixed(0) + "," + ((a >> 16) & 0xff).toFixed(0) +")";
    }
}

