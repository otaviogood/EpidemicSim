
#include <random>
#if __has_include(<emscripten/bind.h>)
#include <emscripten/bind.h>
#endif

// This file is a rewrite of the javascript one.

namespace EpidemicSimCore {
    struct RandomFast {
        typedef uint32_t js_io_t;

        // 0xffffff is biggest 2^n-1 that 32 bit float does exactly.
        // Check with Math.fround(0xffffff) in javascript.
        static constexpr double invMax24Bit = 1.0 / double(0xffffff);

        // This is the main hash function that should produce a non-repeating
        // pseudo-random sequence for 2^31 iterations.
        static js_io_t SmallHashA(js_io_t seed) {
            return ((seed ^ 1057926937) * 3812423987) ^ (seed * seed * 4000000007);
        }
        // This is an extra hash function to clean things up a little.
        static js_io_t SmallHashB(js_io_t seed) {
            return (seed ^ 2156034509) * 3699529241;
        }

        static js_io_t HashIntApprox(js_io_t seedIn, js_io_t fromInclusive, js_io_t toExclusive) {
            //if (toExclusive - fromInclusive > 2000000) throw std::runtime_error("range too large");
            uint32_t seed = RandomFast::SmallHashA(seedIn);
            uint32_t tempState = (seed << 13) | (seed >> 19);
            tempState = RandomFast::SmallHashB(tempState);
            return ((tempState >> 10) % (toExclusive - fromInclusive)) + fromInclusive;
        }

        double RandFloat() {
            randomState = RandomFast::SmallHashA(randomState);
            // Add these 2 lines for extra randomness. And change last line to tempState.
            uint32_t tempState = (randomState << 13) | (randomState >> 19);
            tempState = RandomFast::SmallHashB(tempState);
            return double((tempState >> 8) & 0xffffff) * RandomFast::invMax24Bit;
        }

        // This will be biased...
        js_io_t RandIntApprox(js_io_t a, js_io_t b) {
            // if (b - a > 2000000) alert("random range too big");
            randomState = RandomFast::SmallHashA(randomState);
            uint32_t tempState = (randomState << 13) | (randomState >> 19);
            tempState = RandomFast::SmallHashB(tempState);
            return ((tempState >> 10) % (b - a)) + a;
        }

        RandomFast(double state) : randomState(state) {
        }

        js_io_t randomState = 12345;
    };
}

#if __has_include(<emscripten/bind.h>)
/*EMSCRIPTEN_BINDINGS(RandomFast) {
    emscripten::class_<EpidemicSimCore::RandomFast>("RandomFast")
        .constructor<double>()
        .function("RandFloat", &EpidemicSimCore::RandomFast::RandFloat)
        .function("RandIntApprox", &EpidemicSimCore::RandomFast::RandIntApprox)
        .class_function("SmallHashA", &EpidemicSimCore::RandomFast::SmallHashA)
        .class_function("SmallHashB", &EpidemicSimCore::RandomFast::SmallHashB)
        .class_function("HashIntApprox", &EpidemicSimCore::RandomFast::HashIntApprox)
        ;
}*/
#endif