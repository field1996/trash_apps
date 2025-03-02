import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
    TransformWrapper, 
    TransformComponent,
    ReactZoomPanPinchRef
} from 'react-zoom-pan-pinch';
import dynamic from 'next/dynamic';
import styles from '@/styles/ThumbnailGenerator.module.css';

// 型定義を追加
type HeicBlobResult = Blob | Blob[];

interface TransformState {
    scale: number;
    positionX: number;
    positionY: number;
}

interface TransformWrapperEvent {
    state: TransformState;
}

const ThumbnailGenerator: React.FC = () => {
    // 基本的なstate
    const [imageUrl, setImageUrl] = useState<string>('');
    const [isDragging, setIsDragging] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [opacity, setOpacity] = useState<number>(50);
    const [initialScale, setInitialScale] = useState<number>(1);
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
    const CANVAS_SIZE = 1000;  // プレビューと出力で同じサイズを使用

    // 不透過度の処理
    const handleOpacityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = Math.round(Number(event.target.value) / 5) * 5;
        setOpacity(Math.min(100, Math.max(0, newValue)));
    };

    // 出力処理の修正
    const handleExport = useCallback(async () => {
        if (!imageUrl || isExporting) return;
    
        try {
            setIsExporting(true);
    
            // ガイドラインを非表示
            setShowCenterGuide({ vertical: false, horizontal: false });
    
            const editorElement = document.querySelector(`.${styles.editorContainer}`);
            if (!editorElement) return;
    
            // 元の枠と角丸のスタイルを保存して非表示に
            const originalStyle = {
                border: (editorElement as HTMLElement).style.border,
                borderRadius: (editorElement as HTMLElement).style.borderRadius
            };
            (editorElement as HTMLElement).style.border = 'none';
            (editorElement as HTMLElement).style.borderRadius = '0';
    
            // 元の画像のロードと寸法取得
            const originalImg = new Image();
            await new Promise((resolve, reject) => {
                originalImg.onload = resolve;
                originalImg.onerror = reject;
                originalImg.src = imageUrl;
            });
    
            // 画像の前処理：リサイズとトリミング
            const tempCanvas = document.createElement('canvas');
            const aspectRatio = originalImg.width / originalImg.height;
            let tempWidth, tempHeight;
    
            if (aspectRatio > 1) {
                // 横長の画像
                tempHeight = CANVAS_SIZE;
                tempWidth = tempHeight * aspectRatio;
            } else {
                // 縦長の画像
                tempWidth = CANVAS_SIZE;
                tempHeight = tempWidth / aspectRatio;
            }
    
            tempCanvas.width = tempWidth;
            tempCanvas.height = tempHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;
    
            // リサイズして描画
            tempCtx.drawImage(originalImg, 0, 0, tempWidth, tempHeight);
    
            // 中央部分をトリミング
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = CANVAS_SIZE;
            cropCanvas.height = CANVAS_SIZE;
            const cropCtx = cropCanvas.getContext('2d');
            if (!cropCtx) return;
    
            const sourceX = (tempWidth - CANVAS_SIZE) / 2;
            const sourceY = (tempHeight - CANVAS_SIZE) / 2;
            cropCtx.drawImage(
                tempCanvas,
                sourceX, sourceY,
                CANVAS_SIZE, CANVAS_SIZE,
                0, 0,
                CANVAS_SIZE, CANVAS_SIZE
            );
    
            // 処理済み画像のURLを生成
            const processedImageUrl = cropCanvas.toDataURL('image/png');
    
            // 変更が反映されるのを待つ
            await new Promise(resolve => setTimeout(resolve, 50));
    
            const html2canvas = (await import('html2canvas')).default;
            
            const canvas = await html2canvas(editorElement as HTMLElement, {
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                scale: 1,
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                logging: true,
                imageTimeout: 0,
                onclone: (clonedDoc) => {
                    // クローン要素の枠と角丸も非表示に
                    const clonedContainer = clonedDoc.querySelector(`.${styles.editorContainer}`);
                    if (clonedContainer instanceof HTMLElement) {
                        clonedContainer.style.border = 'none';
                        clonedContainer.style.borderRadius = '0';
                    }
    
                    // ガイドラインを確実に非表示
                    const guides = clonedDoc.querySelectorAll(`.${styles.verticalGuide}, .${styles.horizontalGuide}`);
                    guides.forEach((guide) => {
                        if (guide instanceof HTMLElement) {
                            guide.style.display = 'none';
                        }
                    });
    
                    // 既存の背景レイヤーを削除
                    const existingBgLayer = clonedDoc.querySelector(`.${styles.backgroundLayer}`);
                    if (existingBgLayer) {
                        existingBgLayer.remove();
                    }
    
                    // 新しい背景レイヤーを作成
                    const bgLayer = clonedDoc.createElement('div');
                    bgLayer.className = styles.backgroundLayer;
                    Object.assign(bgLayer.style, {
                        position: 'absolute',
                        top: '0',
                        left: '0',
                        width: `${CANVAS_SIZE}px`,
                        height: `${CANVAS_SIZE}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        zIndex: '1'
                    });
    
                    // 処理済みの画像を配置
                    const newImg = clonedDoc.createElement('img');
                    newImg.src = processedImageUrl;
                    Object.assign(newImg.style, {
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        left: '0',
                        top: '0'
                    });
    
                    // 新しい要素を追加
                    bgLayer.appendChild(newImg);
                    const container = clonedDoc.querySelector(`.${styles.editorContainer}`);
                    if (container) {
                        container.insertBefore(bgLayer, container.firstChild);
                    }
                }
            });
    
            // スタイルを元に戻す
            (editorElement as HTMLElement).style.border = originalStyle.border;
            (editorElement as HTMLElement).style.borderRadius = originalStyle.borderRadius;
    
            canvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'thumbnail.jpg';
                a.click();
                URL.revokeObjectURL(url);
            }, 'image/jpeg', 0.95);
    
        } finally {
            setIsExporting(false);
        }
    }, [imageUrl, isExporting]);

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
                // 画像のアスペクト比を維持しながら、キャンパス内に収まるように初期スケールを計算
                const scaleX = CANVAS_SIZE / img.width;
                const scaleY = CANVAS_SIZE / img.height;
                const initialScale = Math.min(scaleX, scaleY, 1); // 1を超えないようにする
                
                setInitialScale(initialScale);
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
                <div className={styles.opacityControl}>
                    <label>オーバーレイの不透明度</label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={opacity}
                        onChange={handleOpacityChange}
                        className={styles.slider}
                    />
                    <input
                        type="number"
                        min="0"
                        max="100"
                        value={opacity}
                        onChange={handleOpacityChange}
                        className={styles.numberInput}
                    />
                    <span>%</span>
                </div>
                <button
                    onClick={handleExport}
                    disabled={!imageUrl || isExporting}
                    className={styles.exportButton}
                >
                    {isExporting ? '生成中...' : 'サムネイルを生成'}
                </button>
                <div className={styles.instructions}>
                    <span>↑↓←→キーで1pxずつ移動</span>
                </div>
            </div>
    
            <div className={styles.previewWrapper}>
                <div
                    className={`${styles.editorContainer} ${isDragging ? styles.dragging : ''}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    style={{
                        width: `${CANVAS_SIZE}px`,
                        height: `${CANVAS_SIZE}px`
                    }}
                >
                    <div className={styles.layersContainer}>
                        {/* 第1層: 背景画像 */}
                        {imageUrl && (
                            <div className={styles.backgroundLayer}>
                                <img 
                                    src={imageUrl} 
                                    alt="Background"
                                />
                            </div>
                        )}

                        {/* 第2層: オーバーレイ */}
                        {imageUrl && (
                            <div 
                                className={styles.overlayLayer}
                                style={{ opacity: opacity / 100 }}
                            />
                        )}

                        {/* 第3層: 編集可能な画像 */}
                        {imageUrl && (
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
                                doubleClick={{
                                    step: 0.1,
                                    animationTime: 200
                                }}
                            >
                                <TransformComponent
                                    wrapperStyle={{
                                        width: `${CANVAS_SIZE}px`,
                                        height: `${CANVAS_SIZE}px`
                                    }}
                                    contentStyle={{
                                        width: `${CANVAS_SIZE}px`,
                                        height: `${CANVAS_SIZE}px`,
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
                                            maxWidth: '100%',
                                            maxHeight: '100%',
                                            width: 'auto',
                                            height: 'auto',
                                            objectFit: 'contain'
                                        }}
                                    />
                                </TransformComponent>
                            </TransformWrapper>
                        )}
                    </div>

                    {/* ガイドライン */}
                    {showCenterGuide.vertical && (
                        <div className={styles.verticalGuide} />
                    )}
                    {showCenterGuide.horizontal && (
                        <div className={styles.horizontalGuide} />
                    )}
                </div>
                <div className={styles.sizeIndicator}>
                    キャンバスサイズ: {CANVAS_SIZE}x{CANVAS_SIZE}px
                </div>
            </div>
        </div>
    );
};

export default dynamic(() => Promise.resolve(ThumbnailGenerator), { ssr: false });
