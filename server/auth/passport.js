import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';

// Local Strategy for email/password authentication
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      // Find user by email
      const result = await query(
        `SELECT u.*, ur.role 
         FROM profiles u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         WHERE u.email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      const user = result.rows[0];

      // Check if user has a password hash (for migration, some might not)
      if (!user.password_hash) {
        return done(null, false, { message: 'Account requires password reset' });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      
      if (!isValid) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Remove sensitive data
      delete user.password_hash;

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query(
      `SELECT u.*, ur.role 
       FROM profiles u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return done(null, false);
    }

    const user = result.rows[0];
    delete user.password_hash;

    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;
