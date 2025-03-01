// pages/image-resizer.tsx

import React, { useState } from 'react';
import Head from 'next/head';
import JSZip from 'jszip';
import imageCompression from 'browser-image-compression'; // webp変換用に必要
import styles from '@/styles/ImageResizer.module.css';

const ImageResizer: React.FC = () => {
    const [progress, setProgress] = useState<number>(0);
    const MAX_DIMENSION = 2560;

    // 画像のリサイズ処理
    const resizeImageIfNeeded = async (file: File): Promise<{ blob: Blob, wasResized: boolean }> => {
        // 画像をロード
        const loadImage = (file: File): Promise<HTMLImageElement> => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = URL.createObjectURL(file);
            });
        };

        const img = await loadImage(file);
        let { width, height } = img;

        // URLを解放
        URL.revokeObjectURL(img.src);

        // 最大サイズチェック
        if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
            // リサイズ不要の場合は元のファイルをそのまま返す
            return { blob: file, wasResized: false };
        }

        // リサイズが必要な場合、アスペクト比を維持しながら最大サイズを計算
        let scale = 1;
        if (width > height) {
            scale = MAX_DIMENSION / width;
        } else {
            scale = MAX_DIMENSION / height;
        }

        // 新しいサイズを計算
        const newWidth = Math.floor(width * scale);
        const newHeight = Math.floor(height * scale);

        // Canvas を使用してリサイズ
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // 元のファイル形式を取得し、webpの場合はjpegに変換
        const mimeType = file.type === 'image/webp' ? 'image/jpeg' : file.type;

        // Blob として出力
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve({ blob, wasResized: true });
                    } else {
                        reject(new Error('Failed to convert canvas to blob'));
                    }
                },
                mimeType,
                1.0 // 最高品質
            );
        });
    };

    const processImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const zip = new JSZip();
        setProgress(0);

        let resizedCount = 0;
        let convertedCount = 0;
        let totalFiles = files.length;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const isWebp = file.type === 'image/webp';

                try {
                    let processedBlob: Blob;
                    let wasResized = false;

                    if (isWebp) {
                        // webpファイルの場合、まずJPEGに変換
                        const compressedImage = await imageCompression(file, {
                            fileType: 'image/jpeg',
                            maxSizeMB: 100, // サイズ制限を大きく設定
                            useWebWorker: true
                        });
                        
                        // 必要に応じてリサイズ
                        const resizeResult = await resizeImageIfNeeded(
                            new File([compressedImage], file.name, { type: 'image/jpeg' })
                        );
                        processedBlob = resizeResult.blob;
                        wasResized = resizeResult.wasResized;
                        convertedCount++;
                    } else {
                        // webp以外のファイルは通常のリサイズ処理のみ
                        const resizeResult = await resizeImageIfNeeded(file);
                        processedBlob = resizeResult.blob;
                        wasResized = resizeResult.wasResized;
                    }

                    if (wasResized) {
                        resizedCount++;
                    }

                    // ファイル名を設定（webpの場合は拡張子をjpgに変更）
                    const fileName = isWebp ? 
                        file.name.replace(/\.webp$/i, '.jpg') : 
                        file.name;

                    zip.file(fileName, processedBlob);

                    // 進捗を更新
                    const currentProgress = ((i + 1) / files.length) * 100;
                    setProgress(currentProgress);

                    if (i === files.length - 1) {
                        const content = await zip.generateAsync({ type: 'blob' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(content);
                        link.download = 'processed_images.zip';
                        link.click();
                        URL.revokeObjectURL(link.href);
                        
                        // 処理結果を表示
                        alert(
                            `処理完了:\n` +
                            `総ファイル数: ${totalFiles}\n` +
                            `リサイズされたファイル: ${resizedCount}\n` +
                            `WebPからJPGに変換: ${convertedCount}`
                        );
                        
                        // 進捗バーをリセット
                        setTimeout(() => setProgress(0), 1000);
                    }
                } catch (error) {
                    console.error('Error processing file:', file.name, error);
                    throw error;
                }
            }
        } catch (error) {
            console.error('Processing failed:', error);
            alert('処理中にエラーが発生しました。');
            setProgress(0);
        }
    };

    return (
        <>
            <Head>
                <title>Image Processor</title>
                <meta name="description" content="Process and resize images, convert WebP to JPG" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />   
            </Head>

            <main className={styles.main}>
                <div className={styles.container}>
                    <h1 className={styles.title}>Image Processor</h1>
                    <div className={styles.description}>
                        <p>対応ファイル形式: JPG, JPEG, PNG, WebP</p>
                        <p>2560px以上の画像は自動的にリサイズされます</p>
                        <p>WebPファイルは自動的にJPGに変換されます</p>
                        <p>その他の形式は元の形式を維持します</p>
                    </div>
                    <div className={styles.converterBox}>
                        <label htmlFor="fileInput" className={styles.fileInputLabel}>
                            ファイルを選択
                            <input
                                id="fileInput"
                                type="file"
                                multiple
                                accept=".jpg,.jpeg,.png,.webp"
                                onChange={processImages}
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

export default ImageResizer;