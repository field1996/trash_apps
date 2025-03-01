import React, { useState } from 'react';
import Head from 'next/head';
import imageCompression from 'browser-image-compression';
import JSZip from 'jszip';
import styles from '@/styles/WebpConverter.module.css';

const WebpConverter: React.FC = () => {
    const [progress, setProgress] = useState<number>(0);

    const convertAndZipImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const zip = new JSZip();

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                // 画像をJPEGに変換
                const imageFile = await imageCompression(file, {
                    fileType: 'image/jpeg',
                    maxSizeMB: 5,
                    useWebWorker: true
                });

                const arrayBuffer = await imageFile.arrayBuffer();
                zip.file(file.name.replace('.webp', '.jpg'), arrayBuffer);

                // 進捗を更新
                const currentProgress = ((i + 1) / files.length) * 100;
                setProgress(currentProgress);

                if (i === files.length - 1) {
                    const content = await zip.generateAsync({ type: 'blob' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(content);
                    link.download = 'converted_images.zip';
                    link.click();
                    URL.revokeObjectURL(link.href);
                    // 変換完了後、進捗バーをリセット
                    setTimeout(() => setProgress(0), 1000);
                }
            } catch (error) {
                console.error('Error converting file:', error);
                alert('変換中にエラーが発生しました。');
            }
        }
    };

    return (
        <>
            <Head>
                <title>Webp to Jpg Converter</title>
                <meta name="description" content="Convert Webp images to Jpg format" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />   
            </Head>

            <main className={styles.main}>
                <div className={styles.container}>
                    <h1 className={styles.title}>Webp to Jpg Converter</h1>
                    <div className={styles.converterBox}>
                        <label htmlFor="fileInput" className={styles.fileInputLabel}>
                            ファイルを選択
                            <input
                                id="fileInput"
                                type="file"
                                multiple
                                accept=".webp"
                                onChange={convertAndZipImages}
                                className={styles.fileInput}
                            />
                        </label>
                        {progress > 0 && (
                            <div className={styles.progressContainer}>
                                <div 
                                    className={styles.progressBar}
                                    style={{ width: `${progress}%` }}
                                />
                                <p className={styles.progressText}>{Math.round(progress)}%</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
};

export default WebpConverter;