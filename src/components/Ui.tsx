export function Card({children, className=""}:{children:any;className?:string}){
  return <div className={`card ${className}`}>{children}</div>;
}
export function SectionTitle({children}:{children:any}){
  return <div className="section-title mb-2">{children}</div>;
}
export function Field({label,children}:{label:string;children:any}){
  return (
    <label className="block text-sm">
      <span className="text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
export function Btn({kind='primary', className='', ...props}:{kind?:'primary'|'ghost';className?:string} & any){
  const base = kind==='primary'?'btn btn-primary':'btn btn-ghost';
  return <button {...props} className={`${base} ${className}`} />;
}
