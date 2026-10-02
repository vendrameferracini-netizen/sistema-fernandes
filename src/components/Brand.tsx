import { Link } from 'react-router-dom';

export function Brand() {
  return <Link to="/" className="brand" aria-label="Sistema Fernandes, início">
    <span className="brand-mark" aria-hidden="true">F<span>.</span></span>
    <span><span className="brand-small">SISTEMA</span><strong>FERNANDES</strong></span>
  </Link>;
}
