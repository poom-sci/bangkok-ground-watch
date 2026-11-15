import Landing from '@/components/Landing';

const redirect = "if(/[?&]mode=/.test(location.search)){location.replace('/app/'+location.search+location.hash)}";

export default function Page() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: redirect }} />
      <Landing />
    </>
  );
}
