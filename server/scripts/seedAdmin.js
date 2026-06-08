const admin = require('firebase-admin')
require('dotenv').config()

async function main() {
  // Initialize Firebase Admin using environment credentials
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    admin.initializeApp({ credential: admin.credential.cert(svc) })
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp()
  } else {
    console.error('No Firebase admin credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.')
    process.exit(1)
  }

  const auth = admin.auth()
  const firestore = admin.firestore()

  const email = 'admin@traxo.com.ng'
  const password = 'SEUNSEGUN123'

  try {
    // Try to find existing user by email
    let userRecord
    try {
      userRecord = await auth.getUserByEmail(email)
      console.log('Admin user already exists:', userRecord.uid)
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/user-not-found') {
        userRecord = await auth.createUser({ email, password })
        console.log('Created admin user:', userRecord.uid)
      } else {
        throw err
      }
    }

    // Set custom claim 'admin'
    await auth.setCustomUserClaims(userRecord.uid, { admin: true })
    console.log('Set admin custom claim for', userRecord.uid)

    // Ensure a Firestore profile document
    const userRef = firestore.collection('users').doc(userRecord.uid)
    await userRef.set({
      email,
      displayName: 'TRAXO Admin',
      fullName: 'TRAXO Admin',
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    console.log('Wrote Firestore profile for admin user')

    // Output UID so caller can set VITE_ADMIN_UID if desired
    console.log('\nADMIN_UID=' + userRecord.uid)
    process.exit(0)
  } catch (err) {
    console.error('Failed to seed admin user:', err)
    process.exit(1)
  }
}

main()
