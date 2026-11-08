export default function AdminPageHeading({ title, description }: { title: string; description: string }) {
  const tooltipId = `admin-${title.toLowerCase()}-description`;
  return <div className="page-heading admin-compact-heading">
    <h1>{title}</h1>
    <span className="admin-heading-help">
      <button aria-describedby={tooltipId} aria-label={`About ${title}`} className="admin-heading-help-button" type="button">ⓘ</button>
      <span className="admin-heading-tooltip" id={tooltipId} role="tooltip">{description}</span>
    </span>
  </div>;
}
