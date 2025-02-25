import React from 'react';
import Link from 'next/link';

const About: React.FC = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>About Us</h1>
      <p style={styles.description}>
        This is the About page. Here you can find more information about us.
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

export default About;