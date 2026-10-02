import { useEffect, useState } from 'react';
import type { Exercise } from './api';
import { downloadImage, removeUnusedImage, replaceImage, validateImage } from './media';

export function ExerciseImage({ exercise, disabled, onBusy, onChanged }: {
  exercise: Exercise; disabled: boolean; onBusy: (busy: boolean) => void;
  onChanged: (path: string, updatedAt: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [unusedPath, setUnusedPath] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let stopped = false; let localUrl = ''; setPreview(''); setError('');
    setLoading(Boolean(file || exercise.image_path));
    async function load() {
      try {
        const blob = file ?? (exercise.image_path ? await downloadImage(exercise.image_path) : null);
        if (blob && !stopped) { localUrl = URL.createObjectURL(blob); setPreview(localUrl); }
      } catch { if (!stopped) setError('Não foi possível carregar a imagem. Tente novamente.'); }
      finally { if (!stopped) setLoading(false); }
    }
    void load();
    return () => { stopped = true; if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [exercise.image_path, file, retry]);
  async function select(next: File | undefined) {
    setError(''); setNotice('');
    if (!next) { setFile(null); return; }
    onBusy(true);
    try { await validateImage(next); setFile(next); }
    catch (failure) { setFile(null); setInputKey(key => key + 1); setError((failure as Error).message); }
    finally { onBusy(false); }
  }
  async function upload() {
    if (!file || disabled) return; onBusy(true); setError(''); setNotice('');
    try {
      const result = await replaceImage(file, exercise);
      onChanged(result.path, result.updatedAt); setFile(null); setInputKey(key => key + 1);
      setUnusedPath(result.unusedPath); setNotice('Imagem salva.');
    } catch (failure) { setError((failure as Error).message); }
    finally { onBusy(false); }
  }
  async function cleanup() {
    if (!unusedPath) return; onBusy(true);
    try { if (await removeUnusedImage(unusedPath)) setUnusedPath(null); else setError('Não foi possível remover a imagem anterior.'); }
    catch { setError('Não foi possível remover a imagem anterior.'); }
    finally { onBusy(false); }
  }
  return <section className="exercise-media" aria-label="Imagem do exercício"><h2>Imagem do exercício</h2>
    <p>Uma imagem JPEG, PNG ou WebP de até 5 MB. A imagem é salva separadamente dos demais campos.</p>
    {loading && <p role="status">Carregando imagem…</p>}
    {preview && <img className="exercise-image" src={preview} alt={`Imagem de ${exercise.name}`} onError={() => setError('Não foi possível exibir este arquivo como imagem.')} />}
    <label>{exercise.image_path ? 'Substituir imagem' : 'Selecionar imagem'}<input key={inputKey} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || Boolean(unusedPath)} onChange={e => void select(e.target.files?.[0])} /></label>
    {file && <button type="button" className="secondary" disabled={disabled} onClick={() => void upload()}>Salvar imagem</button>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {error && <p role="alert" className="feedback error">{error}</p>}
    {!file && exercise.image_path && <button type="button" className="text-button" disabled={disabled} onClick={() => setRetry(value => value + 1)}>Recarregar imagem</button>}
    {unusedPath && <div role="status"><p>A imagem nova está salva, mas a anterior ainda ocupa espaço.</p><button type="button" className="secondary" disabled={disabled} onClick={() => void cleanup()}>Tentar remover imagem anterior</button></div>}
  </section>;
}
