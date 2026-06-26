import React from 'react';

const sections = ['Home', 'Trending', 'Artists', 'Discover', 'Download', 'Videogen', 'Settings', 'FAQ'];

function Navbar({ onLinkClick, isVisible = true, currentSection }) {
  const shouldShow = isVisible !== false;
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLinkClick = (section) => {
    scrollToTop();
    onLinkClick(section);
  };

  return (
    <nav
      className={`bg-background border-b-2 border-border sticky top-0 z-50 transition-transform duration-300 ${
        shouldShow ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="container mx-auto container-padding py-3 flex justify-between items-center flex-wrap gap-3">
        <a
          href="#home"
          className="text-2xl font-extrabold border-2 border-border bg-primary text-primary-foreground px-3 py-1 shadow-brutal-sm transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick('Home');
          }}
        >
          TuneScout+
        </a>
        <ul className="flex flex-wrap gap-2 text-sm">
          {sections.map((item) => (
            <li key={item}>
              <a
                href={`#${item.toLowerCase()}`}
                className={`inline-block px-3 py-1.5 border-2 border-border font-bold transition-all ${
                  currentSection === item
                    ? 'bg-primary text-primary-foreground shadow-brutal-sm'
                    : 'bg-card hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none shadow-brutal-sm'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick(item);
                }}
                aria-current={currentSection === item ? 'page' : undefined}
              >
                {item}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
