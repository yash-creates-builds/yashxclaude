// Voice lines for the three supported languages (Web Speech API).
const HI_NUM = ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस'];
const GU_NUM = ['', 'એક', 'બે', 'ત્રણ', 'ચાર', 'પાંચ', 'છ', 'સાત', 'આઠ', 'નવ', 'દસ', 'અગિયાર', 'બાર', 'તેર', 'ચૌદ', 'પંદર', 'સોળ', 'સત્તર', 'અઢાર', 'ઓગણીસ', 'વીસ'];
const EN_NUM = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

export const LANGS = [
  { id: 'hi', label: 'हिंदी', bcp: 'hi-IN' },
  { id: 'en', label: 'English', bcp: 'en-IN' },
  { id: 'gu', label: 'ગુજરાતી', bcp: 'gu-IN' },
];

export const VOICE = {
  hi: {
    count: (n) => `${HI_NUM[n] ?? n} सीटी`,
    oneLeft: 'बस एक और',
    gasOff: 'गैस बंद करो',
    released: 'प्रेशर निकल गया। कुकर खोल सकते हो',
    hello: 'सीटी सुन रहा हूँ',
  },
  en: {
    count: (n) => `${EN_NUM[n] ?? n} ${n === 1 ? 'whistle' : 'whistles'}`,
    oneLeft: 'Just one more',
    gasOff: 'Turn off the gas',
    released: 'Pressure is released. You can open the cooker',
    hello: 'Listening for whistles',
  },
  gu: {
    count: (n) => `${GU_NUM[n] ?? n} સીટી`,
    oneLeft: 'બસ એક વધુ',
    gasOff: 'ગેસ બંધ કરો',
    released: 'પ્રેશર નીકળી ગયું. કૂકર ખોલી શકો છો',
    hello: 'સીટી સાંભળું છું',
  },
};

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
