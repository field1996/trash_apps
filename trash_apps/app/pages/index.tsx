import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Webアプリ置き場</h1>
      <p style={styles.description}>主に編集部向けに製作したwebアプリ置き場です</p>
      <nav style={styles.nav}>
        <ul style={styles.list}>
          <li style={styles.listItem}>
            <Link href="/generating_links" legacyBehavior>
              <a style={styles.link}>アフィリエイトカードジェネレータ</a>
            </Link>
          </li>
          <li style={styles.listItem}>
            <Link href="/webp-converter" legacyBehavior>
              <a style={styles.link}>画像フォーマッタ</a>
            </Link>
          </li>
          <li style={styles.listItem}>
            <Link href="/image-editor" legacyBehavior>
              <a style={styles.link}>リンク画像ジェネレータ</a>
            </Link>
          </li>
          <li style={styles.listItem}>
            <Link href="/thumbnail-generator" legacyBehavior>
              <a style={styles.link}>SNS用サムネ画像ジェネレータ</a>
            </Link>
          </li>
        </ul>
      </nav>
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
  nav: {
    marginTop: '1em',
  },
  list: {
    listStyleType: 'none' as const,
    padding: 0,
  },
  listItem: {
    marginBottom: '0.5em',
  },
  link: {
    textDecoration: 'none',
    color: 'blue',
  },
};
