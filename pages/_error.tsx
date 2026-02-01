type Props = { statusCode?: number };

export default function CustomError({ statusCode }: Props) {
  const code = statusCode ?? 500;
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Ошибка {code}</h1>
      <p style={{ marginTop: 10, opacity: 0.85 }}>Попробуйте вернуться на главную.</p>
      <p style={{ marginTop: 12 }}>
        <a href="/" style={{ textDecoration: "underline", fontWeight: 800 }}>
          На главную
        </a>
      </p>
    </main>
  );
}

CustomError.getInitialProps = ({ res, err }: any) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};
