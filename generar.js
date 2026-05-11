









const bcrypt = require('bcrypt');
const pass1 = 'cen123';
const pass2 = 'mat123';

console.log('-----------------------------------');
console.log('Hash para cen123:', bcrypt.hashSync(pass1, 10));
console.log('Hash para mat123:', bcrypt.hashSync(pass2, 10));
console.log('-----------------------------------');