/* eslint @typescript-eslint/no-explicit-any: 0 */
import React, { useState } from 'react';
import Link from 'next/link';

const Generating_links: React.FC = () => {
  const [inputs, setInputs] = useState({
      maker: '',
      serie: '',
      name: '',
      proName: '',
      image: '',
      amazon: '',
      moshimo: '',
      vc: '',
      linkName: '',
      link: '',
  });
    
  const [code, setCode] = useState('');
  const [codeSide, setCodeSide] = useState('');

  // CSVデータを保持するstate
  const [csvData, setCsvData] = useState<Array<typeof inputs>>([]);

  // CSVの行をパースする補助関数
  const parseCSVLine = (line: string): string[] => {
    const results: string[] = [];
    let field = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            results.push(field);
            field = '';
        } else {
            field += char;
        }
    }
    
    results.push(field);
    return results;
  };

  // CSVファイル読み込み処理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const csvText = event.target?.result as string;
        const rows = csvText.split('\n').map(row => 
            parseCSVLine(row.trim())
        );
        
        try {
            if (rows.length < 10) {
                throw new Error('CSVファイルの形式が正しくありません');
            }

            const productCount = rows[0].length - 1;
            const formattedData = [];

            for (let i = 0; i < productCount; i++) {
                const productData = {
                    maker: rows[0][i + 1].replace(/^"|"$/g, ''),
                    serie: rows[1][i + 1].replace(/^"|"$/g, ''),
                    name: rows[2][i + 1].replace(/^"|"$/g, ''),
                    proName: rows[3][i + 1].replace(/^"|"$/g, ''),
                    image: rows[4][i + 1].replace(/^"|"$/g, ''),
                    amazon: rows[5][i + 1].replace(/^"|"$/g, ''),
                    moshimo: rows[6][i + 1].replace(/^"|"$/g, ''),
                    vc: rows[7][i + 1].replace(/^"|"$/g, ''),
                    linkName: rows[8][i + 1].replace(/^"|"$/g, ''),
                    link: rows[9][i + 1].replace(/^"|"$/g, '')
                };
                formattedData.push(productData);
            }

            setCsvData(formattedData);
        } catch (error) {
            alert('CSVファイルの読み込みに失敗しました。ファイル形式を確認してください。');
            console.error(error);
        }
    };
    reader.readAsText(file);
  };

  // CSV文字列をエスケープする関数
  const escapeCSV = (str: string): string => {
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
  };

  // 一括生成処理
  const handleUpload = () => {
      if (csvData.length === 0) {
          alert('先にCSVファイルを読み込んでください。');
          return;
      }

      // 全データに対してコードを生成し、指定の形式でCSVを作成
      const generatedResults = csvData.map(inputData => {
          const generatedCode = generating(inputData);
          const generatedCodeSide = generatingSide(inputData);
          
          return [
              escapeCSV(inputData.name),
              escapeCSV(generatedCode),
              escapeCSV(generatedCodeSide)
          ].join(',');
      });

      // CSVのヘッダー行を追加
      const csvContent = [
          '製品名,生成コード,サイドコード',
          ...generatedResults
      ].join('\n');

      // SJISエンコーディングに変換してダウンロード
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { 
          type: 'text/csv;charset=utf-8' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'generated_results.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // 生成したコードをプレビューに表示
      const allCode = csvData.map(data => generating(data)).join('\n');
      const allCodeSide = csvData.map(data => generatingSide(data)).join('\n');
      setCode(allCode);
      setCodeSide(allCodeSide);
  };
    
      const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setInputs((prev) => ({ ...prev, [id]: value }));
      };
    
      const genClick = () => {
        const generatedCode = generating(inputs);
        const generatedCodeSide = generatingSide(inputs);
        setCode(generatedCode);
        setCodeSide(generatedCodeSide);
      };
    
      const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
          showAlert('コピーしました！');
        });
      };
    
      const showAlert = (message: string) => {
        // ポップアップ要素を作成
        const popup = document.createElement("div");
        popup.classList.add("popup");
    
        // ポップアップの中身を作成
        const messageEl = document.createElement("p");
        messageEl.classList.add("popup__message");
        messageEl.textContent = message;
        popup.appendChild(messageEl);
    
        // 閉じるボタンを作成
        const closeEl = document.createElement("span");
        closeEl.classList.add("popup__close");
        closeEl.textContent = "×";
        closeEl.addEventListener("click", function () {
          popup.parentNode?.removeChild(popup);
        });
        popup.appendChild(closeEl);
    
        // ポップアップをbody要素の子要素として追加
        document.body.appendChild(popup);
      };
    
      return (
        <div className="top_block">
          <div className="input_area">
            <div className="button_area">
              <div className="main_button">
                <input type="button" value="生成" onClick={genClick} />
                <input type="button" value="コピー" onClick={() => copyToClipboard(code)} />
                <input type="button" value="コピー(サイド)" onClick={() => copyToClipboard(codeSide)} />
              </div>
              <div className="sub_button">
                        <input 
                            id="fileupload" 
                            type="file" 
                            accept=".csv"
                            onChange={handleFileSelect}
                        />
                        <button 
                            id="upload-button" 
                            onClick={handleUpload}
                        >
                            一括生成とダウンロード
                        </button>
                    </div>
            </div>
            {[
              { id: 'maker', label: 'メーカー' },
              { id: 'serie', label: 'シリーズ' },
              { id: 'name', label: '製品名' },
              { id: 'proName', label: '型番' },
              { id: 'image', label: '画像URL' },
              { id: 'amazon', label: 'Amazon' },
              { id: 'moshimo', label: '楽天' },
              { id: 'vc', label: 'Yahoo' },
              { id: 'linkName', label: 'その他のリンク先名' },
              { id: 'link', label: 'その他のリンク先URL' },
            ].map((field) => (
              <div className="input_box" key={field.id}>
                <p>{field.label}</p>
                <textarea
                  id={field.id}
                  rows={field.id === 'image' ? 3 : 1}
                  cols={33}
                  value={inputs[field.id as keyof typeof inputs]}
                  onChange={handleInputChange}
                />
              </div>
            ))}
          </div>
          <div>
            <div id="preview" dangerouslySetInnerHTML={{ __html: code }} />
            <div id="preview_side" dangerouslySetInnerHTML={{ __html: codeSide }} />
            <div className="code_area">
              <code id="output">{code + codeSide}</code>
            </div>
          </div>
        </div>
      );
    };
    
    const generating = (inputs: any) => {
      const {
        maker, serie, name, proName, image, amazon, moshimo, vc, linkName, link,
      } = inputs;
    
      let g_code = `<div class="affi-card-detail"><div class="pro-detail"><p class="affi-maker">${maker}</p>`;
      if (serie) {
        g_code += `<p class="affi-series">${serie}</p>`;
      }
      g_code += `<p class="affi-title">${name}</p><p class="affi-model-number">${proName}</p></div><div class="img-block sp-img"><img width="100%" height="100%" src="${image}" alt=""></div><div class="affi-site-button">`;
    
      if (!link) {
        if (amazon) g_code += `<li class="amazon_link link-item"><a href="${amazon}" target="_blank" rel="noopener noreferrer">Amazon</a></li>`;
        if (moshimo) g_code += `<li class="rakuten_link link-item">${moshimo}</li>`;
        if (vc) g_code += `<li class="yahoo_link link-item">${vc}</li>`;
        return `<div class="affi-card"><div class="img-block pc-img"><img width="100%" height="100%" src="${image}" alt=""></div>${g_code}</div></div></div><br>`;
      } else {
        g_code += `<li class="site_link link-item"><a href="${link}" target="_blank" rel="noopener noreferrer">公式サイト</a></li></div>`;
        g_code += `<style>.site_link::after{content: "${linkName}";}</style>`;
        return `<div class="affi-card"><div class="img-block pc-img"><img width="100%" height="100%" src="${image}" alt=""></div>${g_code}</div></div><br>`;
      }
    };
    
    const generatingSide = (inputs: any) => {
      const {
        maker, serie, name, proName, image, amazon, moshimo, vc, linkName, link,
      } = inputs;
    
      let g_code = `<div class="pro-detail"><p class="affi-maker">${maker}</p>`;
      if (serie) {
        g_code += `<p class="affi-series">${serie}</p>`;
      }
      g_code += `<p class="affi-title">${name}</p><p class="affi-model-number">${proName}</p></div><div class="img-block sp-img"><img width="100%" height="100%" src="${image}" alt=""></div><div class="affi-mini-button">`;
    
      if (!link) {
        if (amazon) g_code += `<li class="amazon_link link-item"><a href="${amazon}" target="_blank" rel="noopener noreferrer">Amazon</a></li>`;
        if (moshimo) g_code += `<li class="rakuten_link link-item">${moshimo}</li>`;
        if (vc) g_code += `<li class="yahoo_link link-item">${vc}</li>`;
        return `<div class="affi-card-mini">${g_code}</div></div>`;
      } else {
        g_code += `<li class="site_link link-item"><a href="${link}" target="_blank" rel="noopener noreferrer">公式サイト</a></li></div>`;
        g_code += `<style>.site_link::after{content: "${linkName}";}</style>`;
        return `<div class="affi-card-mini">${g_code}</div>`;
      }
    };
    

export default Generating_links;