// Ancienne page « Déclarations TVA » : remplacée par le suivi simple des déclarations.
export async function getServerSideProps() {
  return { redirect: { destination: '/app/admin/declarations', permanent: false } }
}
export default function Redirect() { return null }
