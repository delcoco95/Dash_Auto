import { useState } from 'react'
import { X, Download } from 'lucide-react'

export default function FilePreviewModal({ file, onClose }) {
  const [downloading, setDownloading] = useState(false)
  if (!file) return null;

  const isImage = file.type?.startsWith('image/') || file.url.match(/\.(jpeg|jpg|gif|png|webp)$/i);

  const handleDownload = async () => {
    // L'attribut `download` d'un <a> est ignoré par la plupart des navigateurs sur une
    // origine différente (stockage Supabase) : le fichier s'ouvre alors dans un nouvel
    // onglet au lieu d'être téléchargé. On récupère donc le fichier en mémoire (blob) et
    // on déclenche le téléchargement depuis une URL locale, qui elle est bien respectée.
    setDownloading(true)
    try {
      const res = await fetch(file.url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = file.name || 'document'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error(err)
      window.open(file.url, '_blank')
    }
    setDownloading(false)
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '800px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>
            {file.name || 'Aperçu du fichier'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
            <X size={24} />
          </button>
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', background: '#f9f9f9', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
          {isImage ? (
            <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
          ) : (
            <iframe src={file.url} style={{ width: '100%', height: '60vh', border: 'none' }} title={file.name} />
          )}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fff' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Fermer
          </button>
          <button onClick={handleDownload} disabled={downloading} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary, #00d4aa)', color: '#fff', cursor: downloading ? 'default' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', opacity: downloading ? 0.7 : 1 }}>
            <Download size={18} />
            {downloading ? 'Téléchargement...' : 'Télécharger'}
          </button>
        </div>
      </div>
    </div>
  )
}
