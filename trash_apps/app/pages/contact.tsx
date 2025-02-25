import React from 'react';
import Link from 'next/link';

const Contact: React.FC = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Contact Us</h1>
      <p style={styles.description}>
        This is the Contact page. Here you can find ways to contact us.
      </p>
      <Link href="/" legacyBehavior>
        <a style={styles.link}>Back to Home</a>
      </Link>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '2em',
    marginBottom: '0.5em',
  },
  description: {
    marginBottom: '1em',
  },
  link: {
    textDecoration: 'none',
    color: 'blue',
  },
};

export default Contact;