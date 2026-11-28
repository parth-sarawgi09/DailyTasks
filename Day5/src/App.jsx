import { useEffect, useState } from "react";
import { initialBooks, loadBooks } from "./libraryData";
import "./styles.css";

function AvailabilityBadge({ availableCopies }) {
  const available = availableCopies > 0;
  return (
    <span className={`badge ${available ? "badge-available" : "badge-unavailable"}`}>
      {available ? `${availableCopies} available` : "All copies loaned"}
    </span>
  );
}

function OverdueReminder({ books }) {
  const overdueBooks = books.filter((book) => (
    book.dueDate && new Date(`${book.dueDate}T00:00:00`) < new Date()
  ));

  if (!overdueBooks.length) return null;

  return (
    <section className="reminder" aria-labelledby="reminder-heading">
      <div className="reminder-icon" aria-hidden="true">!</div>
      <div>
        <h2 id="reminder-heading">Overdue reminder</h2>
        <p>
          {overdueBooks.map((book) => `${book.title} was due ${book.dueDate}`).join(". ")}.
          Please return {overdueBooks.length === 1 ? "it" : "them"} or contact the library.
        </p>
      </div>
    </section>
  );
}

function BookCard({ book, onToggleHold }) {
  return (
    <article className="book-card">
      <div className="book-cover" aria-hidden="true">
        <span>{book.title.slice(0, 1)}</span>
      </div>
      <div className="book-details">
        <div className="book-heading">
          <div>
            <h3>{book.title}</h3>
            <p className="muted">by {book.author}</p>
          </div>
          <AvailabilityBadge availableCopies={book.availableCopies} />
        </div>
        <div className="book-footer">
          <span className="hold-count">
            {book.holdCount} {book.holdCount === 1 ? "reader waiting" : "readers waiting"}
          </span>
          {book.availableCopies === 0 && (
            <button
              className={book.userHasHold ? "button button-secondary" : "button button-primary"}
              aria-label={`${book.userHasHold ? "Cancel hold for" : "Place a hold for"} ${book.title}`}
              onClick={() => onToggleHold(book.id)}
              type="button"
            >
              {book.userHasHold ? "Cancel hold" : "Place a hold"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function BookList({ books, onToggleHold }) {
  const [query, setQuery] = useState("");
  const matchingBooks = books.filter((book) => (
    `${book.title} ${book.author}`.toLowerCase().includes(query.trim().toLowerCase())
  ));

  return (
    <section className="catalog" aria-labelledby="catalog-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Browse collection</p>
          <h2 id="catalog-heading">Books on your list</h2>
        </div>
        <label className="search">
          <span className="visually-hidden">Search books</span>
          <span aria-hidden="true">⌕</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or author"
            type="search"
            value={query}
          />
        </label>
      </div>
      {books.length === 0 ? (
        <p className="empty-state">No books in the catalog yet.</p>
      ) : matchingBooks.length === 0 ? (
        <p className="empty-state">No books match “{query}”. Try another search.</p>
      ) : (
        <div className="book-list">
          {matchingBooks.map((book) => (
            <BookCard key={book.id} book={book} onToggleHold={onToggleHold} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function App({ loadLibrary = loadBooks }) {
  const [books, setBooks] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setErrorMessage("");
    loadLibrary()
      .then((loadedBooks) => {
        if (active) {
          setBooks(loadedBooks);
          setStatus("success");
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage("We couldn’t load the catalog. Check your connection and try again.");
          setStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [loadLibrary, retryCount]);

  function toggleHold(bookId) {
    setBooks((currentBooks) => currentBooks.map((book) => {
      if (book.id !== bookId || book.availableCopies > 0) return book;
      const userHasHold = !book.userHasHold;
      return {
        ...book,
        userHasHold,
        holdCount: book.holdCount + (userHasHold ? 1 : -1),
      };
    }));
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Stacks Library home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>stacks<span className="brand-light"> / library</span></span>
        </a>
        <span className="member-label"><span className="member-dot" /> Member view</span>
      </header>

      <section className="welcome">
        <p className="eyebrow">Your neighborhood library</p>
        <h1>A good book is<br />always within reach.</h1>
        <p className="welcome-copy">See what’s on the shelf, keep an eye on your loans, and save your place in the queue.</p>
      </section>

      <div className="content">
        <div className="catalog-column">
          {status === "loading" ? (
            <p className="state-message" role="status">Loading your library…</p>
          ) : status === "error" ? (
            <section className="error-state" role="alert">
              <span className="error-mark" aria-hidden="true">!</span>
              <div>
                <h2>Catalog unavailable</h2>
                <p>{errorMessage}</p>
                <button className="button button-primary" onClick={() => setRetryCount((count) => count + 1)} type="button">
                  Try again
                </button>
              </div>
            </section>
          ) : (
            <BookList books={books} onToggleHold={toggleHold} />
          )}
        </div>
        <aside className="side-column" aria-label="Library notices">
          <OverdueReminder books={status === "success" ? books : []} />
          <section className="help-card">
            <p className="eyebrow">A quick note</p>
            <h2>Good things take turns.</h2>
            <p>When a book is out, place a hold to join the queue. We’ll let you know when it’s ready for pickup.</p>
            <span className="help-decoration" aria-hidden="true">↗</span>
          </section>
          <p className="fine-print">Due dates and availability reflect the latest library catalog update.</p>
        </aside>
      </div>

      <footer className="footer">
        <span>Stacks Library</span>
        <span>Read more. Worry less.</span>
      </footer>
    </main>
  );
}

export { AvailabilityBadge, BookCard, BookList, OverdueReminder };
