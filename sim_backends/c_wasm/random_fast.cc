
#include <random>
#include <emscripten/bind.h>

// This file is a rewrite of the javascript one.

namespace EpidemicSimCore {
    struct RandomFast {
        typedef int int_t;

        // 0xffffff is biggest 2^n-1 that 32 bit float does exactly.
        // Check with Math.fround(0xffffff) in javascript.
        static constexpr double invMax24Bit = 1.0 / double(0xffffff);

        // This is the main hash function that should produce a non-repeating
        // pseudo-random sequence for 2^31 iterations.
        static int_t SmallHashA(int_t seed) {
            return ((seed ^ 1057926937) * 3812423987) ^ (seed * seed * 4000000007);
        }
        // This is an extra hash function to clean things up a little.
        static int_t SmallHashB(int_t seed) {
            return (seed ^ 2156034509) * 3699529241;
        }

        static int_t HashIntApprox(int_t seedIn, int_t fromInclusive, int_t toExclusive) {
            //if (toExclusive - fromInclusive > 2000000) throw std::runtime_error("range too large");
            int_t seed = RandomFast::SmallHashA(seedIn);
            int_t tempState = (seed << 13) | (seed >> 19);
            tempState = RandomFast::SmallHashB(tempState) | 0;
            toExclusive |= 0;
            fromInclusive |= 0;
            return (abs(tempState >> 10) % (toExclusive - fromInclusive)) + fromInclusive;
        }

        float RandFloat() {
            randomState = RandomFast::SmallHashA(randomState);
            // Add these 2 lines for extra randomness. And change last line to tempState.
            int_t tempState = (randomState << 13) | (randomState >> 19);
            tempState = RandomFast::SmallHashB(tempState);
            return double((tempState >> 8) & 0xffffff) * RandomFast::invMax24Bit;
        }

        RandomFast(int_t state) : randomState(state) {
        }

        int randomState = 12345;
    };
}

EMSCRIPTEN_BINDINGS(RandomFast) {
    emscripten::class_<EpidemicSimCore::RandomFast>("RandomFast")
        .constructor<EpidemicSimCore::RandomFast::int_t>()
        .function("RandFloat", &EpidemicSimCore::RandomFast::RandFloat)
        .class_function("SmallHashA", &EpidemicSimCore::RandomFast::SmallHashA)
        .class_function("SmallHashB", &EpidemicSimCore::RandomFast::SmallHashB)
        .class_function("HashIntApprox", &EpidemicSimCore::RandomFast::HashIntApprox)
        ;
}
