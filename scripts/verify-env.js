require('dotenv').config();

const requiredEnvVars = [
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL_NON_POOLING',
    'JWT_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET'
];

function checkEnvVariables() {
    console.log('Checking environment variables...\n');
    let missingVars = [];

    requiredEnvVars.forEach(envVar => {
        if (!process.env[envVar]) {
            missingVars.push(envVar);
            console.log(`❌ ${envVar} is not set`);
        } else {
            console.log(`✅ ${envVar} is set`);
        }
    });

    if (missingVars.length > 0) {
        console.log('\n⚠️  Missing environment variables:');
        missingVars.forEach(variable => {
            console.log(`   - ${variable}`);
        });
        console.log('\nPlease set these variables in your Vercel dashboard and local .env file');
        process.exit(1);
    } else {
        console.log('\n✅ All required environment variables are set');
    }
}

checkEnvVariables(); 