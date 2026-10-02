import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Brand } from '../../components/Brand';
import { supabase } from '../../lib/supabase';
import { useAuth } from './AuthProvider';
import { homeFor, validatePassword } from './model';
import { changePassword, loginWithUsername } from './api';

export function AuthPage() {
  const { pathname } = useLocation();
  const reset = pathname === '/recuperar-senha';
  const update = pathname === '/definir-senha';
  const { session, profile, loading, recovery, finishRecovery } = useAuth();
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const callbackError = new URLSearchParams(window.location.hash.slice(1)).has('error') ||
    new URLSearchParams(window.location.search).has('error');

  if (recovery && !update) return <Navigate to="/definir-senha" replace />;
  if (session && !loading && !reset && !update) return <Navigate to={homeFor(profile)} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!supabase) { setError('O acesso será liberado assim que a conexão da consultoria estiver configurada.'); return; }
    if (update) {
      const validation = validatePassword(password, confirmation);
      if (validation) { setError(validation); return; }
    }
    setBusy(true);
    try {
      if (update) {
        await changePassword(currentPassword,password);
        finishRecovery();
        setPassword(''); setConfirmation(''); setCurrentPassword('');
      } else {
        await loginWithUsername(username,password);
      }
      setSuccess(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível concluir. Tente novamente.'); }
    finally { setBusy(false); }
  }

  const title = reset ? 'Vamos recuperar seu acesso.' : update ? 'Um novo começo.' : 'Sua evolução começa aqui.';
  return <div className="auth-layout">
    <section className="story" aria-label="Consultoria Filipe Fernandes">
      <div className="story-top"><Brand /><span className="edition">CONSULTORIA ESPORTIVA</span></div>
      <div className={`portrait${!reset && !update ? ' portrait-official' : ''}`}><img src={!reset && !update ? '/filipe-oficial.png' : '/filipe-original.jpg'} alt="Filipe Fernandes, profissional da consultoria esportiva" fetchPriority="high" /></div>
      <div className="story-copy"><span className="eyebrow"><span /> MÉTODO. EXPERIÊNCIA. CONSISTÊNCIA.</span>
        <h1>Mais que um treino.<br /><em>Uma estratégia<br />de evolução.</em></h1>
        <p>Entender você. Construir seu planejamento.<br />Acompanhar cada etapa do processo.</p>
      </div>
      <div className="story-footer"><span>FILIPE FERNANDES</span><span>22 ANOS DE EXPERIÊNCIA</span></div>
    </section>
    <section className="access">
      <header className="access-top"><span>ACOMPANHAMENTO INDIVIDUAL</span><LockKeyhole size={16} aria-hidden="true" /></header>
      <main className="access-content" id="main">
        <span className="section-number">01 <span>/ SEU ESPAÇO DE EVOLUÇÃO</span></span>
        <h2>{title}</h2>
        <p className="intro">{reset ? 'Você pode recuperar seu acesso sem precisar de e-mail.' : update ? 'Informe a senha atual ou temporária e defina uma nova senha pessoal.' : 'Acesse sua consultoria e dê o próximo passo no seu planejamento.'}</p>
        {!supabase && <div className="notice" role="status"><ShieldCheck size={20} /><div><strong>Acesso em preparação</strong><p>A consultoria ainda não está conectada. O login será liberado após a configuração.</p></div></div>}
        {callbackError && <p className="feedback error" role="alert">Não foi possível validar o acesso. Entre com seu usuário e senha.</p>}
        {reset ? <div className="notice"><div><strong>Fale com o Filipe</strong><p>Informe seu usuário ao Filipe. Após confirmar sua identidade, ele poderá definir uma senha temporária. Você escolherá uma nova senha ao entrar.</p><p>Se você é o Filipe, procure o responsável pelo projeto Supabase para recuperar seu acesso.</p></div></div>
        : success && update ? <div className="success-panel" role="status"><CheckCircle2 size={32} /><h3>Senha atualizada</h3><p>Entre novamente com seu usuário e sua nova senha.</p><Link className="primary" to="/entrar">Voltar para o login<ArrowRight size={18} /></Link></div>
        : update && !loading && (!session || !profile) ? <div className="notice"><div><strong>Entre com seu usuário e senha</strong><p>Use sua senha atual ou a senha temporária fornecida pelo Filipe.</p><Link to="/entrar">Ir para o login</Link></div></div>
        : <form onSubmit={submit} aria-label={reset ? 'Recuperar acesso' : update ? 'Definir senha' : 'Entrar na consultoria'}>
          {!update && <label>Usuário<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Seu usuário" required maxLength={40} value={username} onChange={event => setUsername(event.target.value)} /></label>}
          {update && <label>Senha atual ou temporária<input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>}
          {!reset && <><label>{update ? 'Nova senha' : 'Senha'}<span className="password-field"><input type={visible ? 'text' : 'password'} name="password" autoComplete={update ? 'new-password' : 'current-password'} placeholder={update ? 'Pelo menos 12 caracteres' : 'Sua senha de acesso'} required minLength={update ? 12 : undefined} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>
          {update && <label>Confirme a nova senha<input type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
          {!update && <div className="form-links"><span><LockKeyhole size={13} /> Acesso pessoal</span><Link to="/recuperar-senha">Esqueci minha senha</Link></div>}</>}
          {error && <p className="feedback error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || loading || (update && !session)} type="submit">{busy ? 'Aguarde…' : loading ? 'Verificando acesso…' : reset ? 'Enviar link de recuperação' : update ? 'Salvar nova senha' : 'Entrar'}<ArrowRight size={19} aria-hidden="true" /></button>
        </form>}
        {(reset || update) ? <Link className="back" to="/entrar"><ArrowLeft size={16} /> Voltar para o login</Link> : <p className="invitation">Seu acesso é exclusivo e disponibilizado pelo Filipe.<br />Ainda não recebeu? Fale com seu coach.</p>}
        <div className="method"><span>UM PROCESSO. A SUA EVOLUÇÃO.</span><ol><li><b>01</b>Análise</li><li><b>02</b>Planejamento</li><li><b>03</b>Execução</li><li><b>04</b>Avaliação</li></ol></div>
      </main>
      <footer className="access-footer"><span>© {new Date().getFullYear()} Sistema Fernandes</span><span><ShieldCheck size={14} /> Área exclusiva</span></footer>
    </section>
  </div>;
}
