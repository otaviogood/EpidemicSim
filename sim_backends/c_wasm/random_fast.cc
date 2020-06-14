
#include <random>
#if __has_include(<emscripten/bind.h>)
#include <emscripten/bind.h>
#endif

// This file is a rewrite of the javascript one.

namespace EpidemicSimCore {
    struct RandomFast {
        typedef double js_io_t;

        // 0xffffff is biggest 2^n-1 that 32 bit float does exactly.
        // Check with Math.fround(0xffffff) in javascript.
        static constexpr double invMax24Bit = 1.0 / double(0xffffff);

        // This is the main hash function that should produce a non-repeating
        // pseudo-random sequence for 2^31 iterations.
        static js_io_t SmallHashA(js_io_t seed_) {
            int64_t seed = (long long)seed_;
            int64_t ret = ((seed ^ 1057926937) * 3812423987) ^ (seed * seed * 4000000007);
            return ret;
        }
        // This is an extra hash function to clean things up a little.
        static js_io_t SmallHashB(js_io_t seed_) {
            int64_t seed = (long long)seed_;
            int64_t ret = (seed ^ 2156034509) * 3699529241;
            return ret;
        }

        static js_io_t HashIntApprox(js_io_t seedIn, js_io_t fromInclusive, js_io_t toExclusive) {
            //if (toExclusive - fromInclusive > 2000000) throw std::runtime_error("range too large");
            int64_t seed = RandomFast::SmallHashA(seedIn);
            int64_t tempState = ((long long)seed << 13) | ((long long)seed >> 19);
            tempState = RandomFast::SmallHashB(tempState);// | 0;
            //toExclusive |= 0;
            //fromInclusive |= 0;
            return (abs(tempState >> 10) % ((long long)toExclusive - (long long)fromInclusive)) + fromInclusive;
        }

        float RandFloat() {
            randomState = RandomFast::SmallHashA(randomState);
            // Add these 2 lines for extra randomness. And change last line to tempState.
            int64_t tempState = ((long long)randomState << 13) | ((long long)randomState >> 19);
            tempState = RandomFast::SmallHashB(tempState);
            return double((tempState >> 8) & 0xffffff) * RandomFast::invMax24Bit;
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
        .class_function("SmallHashA", &EpidemicSimCore::RandomFast::SmallHashA)
        .class_function("SmallHashB", &EpidemicSimCore::RandomFast::SmallHashB)
        .class_function("HashIntApprox", &EpidemicSimCore::RandomFast::HashIntApprox)
        ;
}*/
#endif