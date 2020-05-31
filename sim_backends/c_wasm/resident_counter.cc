
#include <vector>
#include <cstdlib>
#include <emscripten/bind.h>

// constructor in global namespace. 
// TODO: a huge vector of char[24] skips a pointer indirection.
std::vector<std::string> activitiesNormal;
std::vector<std::string> activitiesWhileSick;

namespace EpidemicSimCore {

    // This could be embedded inside the javascript person object, to avoid duplication of code and data. 
    // Just essential topology data, like this person's places indices.
    struct PersonCore {
        unsigned int id = 0; // TODO: uint enough?
        int householdIndex = 0;
        int hospitalIndex = 0;
        int marketIndex = 0;
        int officeIndex = 0;
        int activityIndex = 0;
        bool isolating = false;

        PersonCore(unsigned int id, int householdIndex, int officeIndex, int marketIndex, int hospitalIndex, int activityIndex)
            : id(id), householdIndex(householdIndex), hospitalIndex(hospitalIndex), marketIndex(marketIndex), officeIndex(officeIndex), activityIndex(activityIndex) {
        }

        char getActivity(int hour) const {
            if(isolating) {
                return activitiesWhileSick[0][hour];
            } else {
                return activitiesNormal[activityIndex][hour];
            }
        }
    };

    struct ResidentCounter {
        std::vector<PersonCore> persons;
        std::vector<int> householdResidentCount;
        std::vector<int> hospitalResidentCount;
        std::vector<int> marketResidentCount;
        std::vector<int> officeResidentCount;
        
        ResidentCounter(int nHouseHolds, int nOffices, int nMarkets, int nHospitals) { 
            householdResidentCount.resize(nHouseHolds);
            hospitalResidentCount.resize(nHospitals);
            marketResidentCount.resize(nMarkets);
            officeResidentCount.resize(nOffices);
            persons.reserve(nHouseHolds);
        }

        static void registerNormalActivitySchedule(const std::string& activityScheduleString) {
            activitiesNormal.push_back(activityScheduleString);
        }

        static void registerSickActivitySchedule(const std::string& activityScheduleString) {
            activitiesWhileSick.push_back(activityScheduleString);
        }

        void addPerson(const PersonCore& p) {
            persons.push_back(p);
        }

        void updatePersonIsolating(int personId, bool sickMode) {
            persons[personId].isolating = sickMode;
        }

        void count(int hour) {
            printf("ResidentCounter::count persons.size=%zu\n", persons.size());
            std::fill(householdResidentCount.begin(), householdResidentCount.end(), 0);
            std::fill(officeResidentCount.begin(), officeResidentCount.end(), 0);
            std::fill(marketResidentCount.begin(), marketResidentCount.end(), 0);
            std::fill(hospitalResidentCount.begin(), hospitalResidentCount.end(), 0);

            for (size_t i = 0; i < persons.size(); i++) {
                const PersonCore& p = persons[i];
                const char a = p.getActivity(hour);

                if (a == 'h') {
                    //if (p.householdIndex >= householdResidentCount.size()) printf("home %d %zu\n", p.householdIndex, householdResidentCount.size());
                    householdResidentCount[p.householdIndex]++;
                }
                else if (a == 'w') {
                    //if (p.officeIndex >= officeResidentCount.size()) printf("off %d %zu\n", p.officeIndex, officeResidentCount.size());
                    officeResidentCount[p.officeIndex]++;
                }
                else if (a == 's') {
                    //if (p.marketIndex >= marketResidentCount.size()) printf("off %d %zu\n", p.marketIndex, marketResidentCount.size());
                    marketResidentCount[p.marketIndex]++;
                }
                else if (a == 'o') {
                    //if (p.hospitalIndex >= hospitalResidentCount.size()) printf("off %d %zu\n", p.hospitalIndex, hospitalResidentCount.size());
                    hospitalResidentCount[p.hospitalIndex]++;
                }
            }
        }

        // passing the C++ objects like std::vector is risky: need to delete them or they leak
        int getHouseholdResidentCount(int index) const {
            return householdResidentCount[index];
        }

        int getHospitalResidentCount(int index) const {
            return hospitalResidentCount[index];
        }

        int getMarketResidentCount(int index) const {
            return marketResidentCount[index];
        }

        int getOfficeResidentCount(int index) const {
            return officeResidentCount[index];
        }

    };

};

EMSCRIPTEN_BINDINGS(ResidentCounterModule) {
    emscripten::register_vector<int>("vector<int>");
    emscripten::class_<EpidemicSimCore::PersonCore>("PersonCore")
        .constructor<unsigned int, int, int, int, int, int>()
        .property("id", &EpidemicSimCore::PersonCore::id)
        .property("householdIndex", &EpidemicSimCore::PersonCore::householdIndex)
        .property("hospitalIndex", &EpidemicSimCore::PersonCore::hospitalIndex)
        .property("marketIndex", &EpidemicSimCore::PersonCore::marketIndex)
        .property("officeIndex", &EpidemicSimCore::PersonCore::officeIndex)
        .property("activityIndex", &EpidemicSimCore::PersonCore::activityIndex)
        .function("getActivity", &EpidemicSimCore::PersonCore::getActivity)
        ;
    emscripten::class_<EpidemicSimCore::ResidentCounter>("ResidentCounter")
        .constructor<int, int, int, int>()
        .function("count", &EpidemicSimCore::ResidentCounter::count)
        .function("addPerson", &EpidemicSimCore::ResidentCounter::addPerson)
        .function("updatePersonIsolating", &EpidemicSimCore::ResidentCounter::updatePersonIsolating)
        .class_function("registerNormalActivitySchedule", &EpidemicSimCore::ResidentCounter::registerNormalActivitySchedule)
        .class_function("registerSickActivitySchedule", &EpidemicSimCore::ResidentCounter::registerSickActivitySchedule)
        .function("getHouseholdResidentCount", &EpidemicSimCore::ResidentCounter::getHouseholdResidentCount)
        .function("getHospitalResidentCount", &EpidemicSimCore::ResidentCounter::getHospitalResidentCount)
        .function("getMarketResidentCount", &EpidemicSimCore::ResidentCounter::getMarketResidentCount)
        .function("getOfficeResidentCount", &EpidemicSimCore::ResidentCounter::getOfficeResidentCount)
        ;
}
