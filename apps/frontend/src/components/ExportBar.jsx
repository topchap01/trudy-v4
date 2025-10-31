import { Button } from './ui/button'
import { api } from '../lib/api'

export default function ExportBar({ campaignId, onExported }) {
  const handlePdf = async () => {
    await api.exportPdf(campaignId)
    onExported?.()
  }

  const handleDocx = async () => {
    await api.exportDocx(campaignId)
    onExported?.()
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handlePdf}>
        Export PDF
      </Button>
      <Button variant="outline" onClick={handleDocx}>
        Export DOCX
      </Button>
    </div>
  )
}
