<template>
    <div>
        <p> According to CDC guidelines, the infectious period is considered differently for asymptomatic and symptomatic individuals. 
                        Please take a moment to tell us about the time range of your symptoms, if any. </p>
        <v-container fluid class="inside-stepper-spacing">
            <v-row class="align-center">
                <v-col
                    cols="6"
                >
                    <p> Are you symptomatic or asymptomatic? <br/>
                        <v-tooltip 
                            bottom
                            max-width="240px"
                            transition="fade-transition">
                            <template v-slot:activator="{ on }">
                            <small 
                                v-on="on"> 
                                <a> I don't know what this means </a> 
                                <v-icon small class="pb-1 pointerOnHover">mdi-help-circle-outline</v-icon>
                            </small> 
                            </template>
                            <span>Select "I am symptomatic" if you had any COVID-19 symptoms (e.g shortness of breath, cough, or fever). If you feel healthy but tested positive for COVID, select "I am asymptomatic"</span>
                        </v-tooltip>
                    </p>
                    
                </v-col>
                <v-col>
                    <v-select v-model="symptomatic" placeholder="Click to choose an option" :items="symptoms"> </v-select>
                </v-col>
            </v-row>
            <v-row style="align-items:center">
                <v-col v-if="symptomatic != ''" cols="6">
                    <p> {{ dateMessage}} </p>
                </v-col>
                <v-col v-if="symptomatic != ''">
                    <v-menu
                        ref="menu"
                        v-model="menu"
                        :close-on-content-click="false"
                        transition="slide-y-transition"
                        offset-y
                        min-width="290px"
                        mr-2
                        >
                        <template v-slot:activator="{ on }">
                            <v-text-field
                                class="mr-4 pb-2"
                                v-model="date"
                                placeholder="Click to choose a date"
                                prepend-inner-icon="mdi-calendar"
                                readonly
                                v-on="on"
                            ></v-text-field>
                        </template>
                        <v-date-picker 
                            v-model="date" 
                            :max="todayDate"
                            no-title 
                            scrollable
                            @input="menu=false">
                        </v-date-picker>
                    </v-menu>                        
                </v-col>
            </v-row>
        </v-container>
    </div>
</template>

<script>
import moment from 'moment'

export default {
    name: "PreliminaryDiv",
    data: () => {
        return {
            symptoms: ["I am symptomatic", "I am asymptomatic"],
            menu: false,
            patient: {}
        }
    },
    mounted() {
        this.patient = this.$store.getters['patients/activePatient']
    },
    computed: {
        symptomatic: {
            get() {
                return this.patient.symptomatic ? "I am symptomatic" : "I am asymptomatic"
            },
            set(newVal) {
                this.patient.symptomatic = (newVal == "I am symptomatic") ? 1 : 0
                this.updatePatient()
            } 
        },
        date: {
            get() {
                return this.patient.symptomatic ? 
                    this.patient.onset_date == undefined ? undefined : this.patient.onset_date.format('YYYY-MM-DD') 
                    : this.patient.diagnosis_date == undefined ? undefined : this.patient.diagnosis_date.format('YYYY-MM-DD')
            },
            set(newVal) {
                if (this.patient.symptomatic) {
                    this.patient.onset_date = moment(newVal)
                } else {
                    this.patient.diagnosis_date = moment(newVal)
                }
                this.updatePatient()
            }
        },
        todayDate() {
            return moment().format('YYYY-MM-DD')
        },
        dateMessage() {
            if (this.symptomatic == "I am symptomatic") {
                return "When did you first begin experiencing symptoms?"
            } else {
                return "When were you diagnosed?"
            }
        },
    },
    watch: {
        symptomatic() {
            this.patient.symptomatic 
            this.updatePatient()
        },
        date() {
            this.updatePatient()
        },
    },
    methods: {
        updatePatient() {
            this.$store.commit('patients/updatePatient', this.patient)
        }
    }
}

</script>

<style scoped>
    .inside-stepper-spacing {
        max-width: 630px;
    }

    .pointerOnHover {
        cursor: pointer;
    }
</style>