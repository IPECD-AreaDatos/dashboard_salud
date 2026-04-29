









const bcrypt = require('bcrypt');
const pass1 = 'admin123';
const pass2 = 'coord123';

console.log('-----------------------------------');
console.log('Hash para admin123:', bcrypt.hashSync(pass1, 10));
console.log('Hash para coord123:', bcrypt.hashSync(pass2, 10));
console.log('-----------------------------------');