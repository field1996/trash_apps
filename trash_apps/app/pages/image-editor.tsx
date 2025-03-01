// pages/image-editor.tsx

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import dynamic from 'next/dynamic';
import styles from '@/styles/ImageEditor.module.css';
import { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
type HeicBlobResult = Blob | Blob[];
// カスタムインターフェースの定義
interface TransformState {
    scale: number;
    positionX: number;
    positionY: number;
}

// onTransformed で受け取る ref の型定義
interface TransformWrapperEvent {
    state: TransformState;
}

const ImageEditor: React.FC = () => {
    const [imageUrl, setImageUrl] = useState<string>('');
    const [isDragging, setIsDragging] = useState(false);
    const [isTransparent, setIsTransparent] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
    const [transformState, setTransformState] = useState<TransformState>({
        scale: 1,
        positionX: 0,
        positionY: 0
    });

    const [showCenterGuide, setShowCenterGuide] = useState({
        vertical: false,
        horizontal: false
    });
    const [initialScale, setInitialScale] = useState(1);

    // ファイル処理関数
    const processFile = async (file: File) => {
        try {
            let processedFile = file;
    
            // HEICファイルの場合、PNGに変換
            if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
                const heic2any = (await import('heic2any')).default;
                const pngBlob = await heic2any({
                    blob: file,
                    toType: 'image/png',
                }) as HeicBlobResult;
    
                if (pngBlob instanceof Blob) {
                    processedFile = new File([pngBlob], file.name.replace('.heic', '.png'), {
                        type: 'image/png'
                    });
                } else if (Array.isArray(pngBlob) && pngBlob.length > 0) {
                    processedFile = new File([pngBlob[0]], file.name.replace('.heic', '.png'), {
                        type: 'image/png'
                    });
                } else {
                    throw new Error('HEIC conversion failed');
                }
            }
    
            // 既存のURLを解放
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
    
            const url = URL.createObjectURL(processedFile);
            setImageUrl(url);
        } catch (error) {
            console.error('Error processing file:', error);
            alert('ファイルの処理中にエラーが発生しました。');
        }
    };

    // 画像読み込み時のスケール計算を追加
    useEffect(() => {
        if (imageUrl) {
            const img = new Image();
            img.onload = () => {
                const containerWidth = 400;
                const containerHeight = 400;
                
                // 画像とコンテナの縦横比を比較して、適切なスケールを計算
                const scaleX = containerWidth / img.width;
                const scaleY = containerHeight / img.height;
                const scale = Math.min(scaleX, scaleY, 1); // 1を超えないようにする
                
                setInitialScale(scale);
            };
            img.src = imageUrl;
        }
    }, [imageUrl]);

    // キーボード操作のハンドラー
    useEffect(() => {
        let moveInterval: NodeJS.Timeout | null = null;
        const moveDistance = 1;
        const initialDelay = 400;
        const repeatInterval = 16;
    
        const moveImage = (direction: 'up' | 'down' | 'left' | 'right') => {
            if (!transformRef.current) return;
    
            const movements = {
                up: { x: 0, y: -moveDistance },
                down: { x: 0, y: moveDistance },
                left: { x: -moveDistance, y: 0 },
                right: { x: moveDistance, y: 0 }
            };
    
            const { x, y } = movements[direction];
            transformRef.current.setTransform(
                transformState.positionX + x,
                transformState.positionY + y,
                transformState.scale
            );
        };
    
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!imageUrl || !transformRef.current) return;
    
            if (e.ctrlKey || e.altKey || e.metaKey) return;
    
            let direction: 'up' | 'down' | 'left' | 'right' | null = null;
    
            switch (e.key) {
                case 'ArrowUp':
                    direction = 'up';
                    break;
                case 'ArrowDown':
                    direction = 'down';
                    break;
                case 'ArrowLeft':
                    direction = 'left';
                    break;
                case 'ArrowRight':
                    direction = 'right';
                    break;
                default:
                    return;
            }
    
            e.preventDefault();
    
            moveImage(direction);
    
            if (!moveInterval) {
                moveInterval = setTimeout(() => {
                    moveInterval = setInterval(() => {
                        moveImage(direction!);
                    }, repeatInterval);
                }, initialDelay);
            }
        };
    
        // 未使用パラメータを削除
        const handleKeyUp = () => {
            if (moveInterval) {
                clearInterval(moveInterval);
                moveInterval = null;
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
    
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (moveInterval) {
                clearInterval(moveInterval);
            }
        };
    }, [imageUrl, transformState]);

    // ファイル選択ハンドラー
    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            processFile(file);
        }
    }, [imageUrl]);

    // ドラッグ&ドロップハンドラー
    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) {
            processFile(file);
        }
    }, []);

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
    }, []);

    // クリップボードハンドラー
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                        processFile(file);
                        break;
                    }
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    // 変換状態が変更されたときのハンドラー
    const handleTransform = useCallback((ref: TransformWrapperEvent) => {
        setTransformState({
            scale: ref.state.scale,
            positionX: ref.state.positionX,
            positionY: ref.state.positionY
        });

        // 中心線のチェック処理
        const imageElement = document.querySelector(`.${styles.editorImage}`) as HTMLImageElement;
        if (imageElement) {
            const rect = imageElement.getBoundingClientRect();
            const containerElement = document.querySelector(`.${styles.editorContainer}`);
            if (containerElement) {
                const containerRect = containerElement.getBoundingClientRect();
                
                const containerCenterX = containerRect.width / 2;
                const containerCenterY = containerRect.height / 2;
                
                const imageCenterX = rect.left - containerRect.left + rect.width / 2;
                const imageCenterY = rect.top - containerRect.top + rect.height / 2;
                
                const tolerance = 1;
                setShowCenterGuide({
                    vertical: Math.abs(imageCenterX - containerCenterX) < tolerance,
                    horizontal: Math.abs(imageCenterY - containerCenterY) < tolerance
                });
            }
        }
    }, []);

    // 画像出力処理
    const handleExport = useCallback(async () => {
        if (!imageUrl || isExporting) return;
    
        try {
            setIsExporting(true);
    
            // ガイドラインを非表示に
            setShowCenterGuide({ vertical: false, horizontal: false });
    
            // エディタ要素を取得
            const editorElement = document.querySelector(`.${styles.editorContainer}`);
            if (!editorElement) return;
    
            // 元のスタイルを保存
            const originalBorder = (editorElement as HTMLElement).style.border;
            const originalBorderRadius = (editorElement as HTMLElement).style.borderRadius;
            
            // 一時的に枠線と角丸を非表示に
            (editorElement as HTMLElement).style.border = 'none';
            (editorElement as HTMLElement).style.borderRadius = '0';
    
            // チェッカーボードパターンの要素を一時的に非表示に
            const checkerboardElement = editorElement.querySelector(`.${styles.checkerboardBackground}`);
            if (checkerboardElement) {
                (checkerboardElement as HTMLElement).style.display = 'none';
            }
    
            // html2canvas を使用して DOM を Canvas として描画
            const html2canvas = (await import('html2canvas')).default;
            
            const canvas = await html2canvas(editorElement as HTMLElement, {
                width: 400,
                height: 400,
                backgroundColor: isTransparent ? null : '#FFFFFF',
                scale: 1,
                useCORS: true,
                ignoreElements: (element) => {
                    // チェッカーボードパターンの要素を無視
                    return element.classList.contains(styles.checkerboardBackground);
                }
            });
    
            // スタイルを元に戻す
            (editorElement as HTMLElement).style.border = originalBorder;
            (editorElement as HTMLElement).style.borderRadius = originalBorderRadius;
            if (checkerboardElement) {
                (checkerboardElement as HTMLElement).style.display = '';
            }
    
            // PNGとして保存
            canvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'output.png';
                a.click();
                URL.revokeObjectURL(url);
    
                // 状態を元に戻すための遅延を設定
                setTimeout(() => {
                    handleTransform({
                        state: transformState
                    });
                }, 100);
            }, 'image/png');
        } finally {
            setIsExporting(false);
        }
    }, [imageUrl, isTransparent, isExporting, transformState]);

    // コンポーネントのクリーンアップ
    useEffect(() => {
        return () => {
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    return (
        <div className={styles.container}>
            <div className={styles.controls}>
                <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.heic"
                    onChange={handleFileSelect}
                    className={styles.fileInput}
                />
                <label className={styles.transparentToggle}>
                    <input
                        type="checkbox"
                        checked={isTransparent}
                        onChange={(e) => setIsTransparent(e.target.checked)}
                    />
                    背景を透過
                </label>
                <button
                    onClick={handleExport}
                    disabled={!imageUrl || isExporting}
                    className={styles.exportButton}
                >
                    {isExporting ? '処理中...' : '画像を保存'}
                </button>
                <div className={styles.instructions}>
                    <span>↑↓←→キーで1pxずつ移動</span>
                </div>
            </div>

            <div
                className={`${styles.editorContainer} ${isDragging ? styles.dragging : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                style={{
                    backgroundColor: isTransparent ? 'transparent' : '#FFFFFF',
                }}
            >
                {isTransparent && <div className={styles.checkerboardBackground} />}
                {(showCenterGuide.vertical || showCenterGuide.horizontal) && (
                    <div className={styles.guideOverlay} />
                )}
                {showCenterGuide.vertical && (
                    <div className={styles.verticalGuide} />
                )}
                {showCenterGuide.horizontal && (
                    <div className={styles.horizontalGuide} />
                )}
                {imageUrl ? (
                    <TransformWrapper
                        ref={transformRef}
                        initialScale={initialScale}
                        minScale={0.1}
                        maxScale={4}
                        centerOnInit={true}
                        limitToBounds={false}
                        onTransformed={handleTransform}
                        wheel={{
                            step: 0.02,
                            smoothStep: 0.0003  // より細かいステップを追加
                        }}
                        pinch={{
                            step: 0.02
                        }}
                        doubleClick={{
                            step: 0.1,
                            animationTime: 200  // アニメーション時間を調整
                        }}
                        zoomAnimation={{
                            size: 0.02,
                            animationTime: 100, // アニメーション時間を短く
                            animationType: "linear" // リニアなアニメーションに変更
                        }}
                        alignmentAnimation={{
                            sizeX: 0,
                            sizeY: 0,
                            animationTime: 100,
                            animationType: "linear"
                        }}
                        panning={{
                            disabled: false,
                            velocityDisabled: true // 慣性スクロールを無効化
                        }}
                        velocityAnimation={{
                            sensitivity: 0,     // 慣性をオフ
                            animationTime: 100
                        }}
                    >
                        <TransformComponent
                            wrapperStyle={{
                                width: '400px',
                                height: '400px'
                            }}
                            contentStyle={{
                                width: '400px',
                                height: '400px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <img
                                src={imageUrl}
                                alt="Editor"
                                className={styles.editorImage}
                                style={{ 
                                    objectFit: 'contain',
                                    willChange: 'transform',
                                    maxWidth: '100%',  // コンテナ幅を超えないように
                                    maxHeight: '100%'  // コンテナ高さを超えないように
                                }}
                            />
                        </TransformComponent>
                    </TransformWrapper>
                ) : (
                    <div className={styles.placeholder}>
                        画像をドラッグ＆ドロップ<br/>
                        または<br/>
                        クリップボードから貼り付け
                    </div>
                )}
            </div>
        </div>
    );
};

export default dynamic(() => Promise.resolve(ImageEditor), { ssr: false });