/* eslint @typescript-eslint/no-explicit-any: 0 */
import React, { useState } from 'react';
import "../styles/affistyle.css";

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
                <input id="fileupload" type="file" />
                <button id="upload-button" onClick={() => alert('ファイルをアップロード')}>ファイルをアップロード</button>
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