/**
 * Beats for the ring around the Yard: Wadsworth House, Dexter Gate, the Science
 * Center, Memorial Hall, the Old Burying Ground, Smith Campus Center and the
 * Square itself.
 */

const SCI = "https://en.wikipedia.org/wiki/Zimmer_Hall";
const MEMHALL =
  "https://en.wikipedia.org/wiki/Memorial_Hall_(Harvard_University)";
const BURY =
  "https://en.wikipedia.org/wiki/Old_Burying_Ground_(Cambridge,_Massachusetts)";
const SQUARE = "https://en.wikipedia.org/wiki/Harvard_Square";
const GATES = "https://en.wikipedia.org/wiki/Gates_of_Harvard_Yard";
const YARD = "https://en.wikipedia.org/wiki/Harvard_Yard";

export const beats = [
  /* ------------------------------------------------ Wadsworth House --- */
  {
    id: "wadsworth-arrival",
    subject: "wadsworth-house",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture", "history"],
    look: "the yellow clapboard house",
    text: `The yellow wooden house is Wadsworth House, seventeen twenty-six.
      It is the second oldest building at Harvard and the only one in this part
      of the Yard that is not made of brick or stone.`,
    sources: [YARD],
  },
  {
    id: "wadsworth-presidents",
    subject: "wadsworth-house",
    angle: "history",
    depth: 2,
    tags: ["history", "power"],
    text: `This was the president's house for about a century and a half.
      Which tells you something about how small early Harvard was: the head of
      the institution lived in a timber house facing the road, close enough to
      the students to hear them. George Washington also used it briefly as
      headquarters in seventeen seventy-five. Today it holds the University
      Marshal and the University Librarian, so it has stayed administrative for
      three hundred years without ever becoming grand.`,
    sources: [YARD],
  },
  {
    id: "wadsworth-enslaved",
    subject: "wadsworth-house",
    angle: "people",
    depth: 2,
    tags: ["people", "history", "race"],
    text: `There is a plaque on this building worth stopping for. It names four
      enslaved people who lived and worked here in the seventeen thirties and
      forties, in the households of two Harvard presidents: Titus, Venus, Bilhah
      and Juba. Harvard installed it in twenty sixteen. For most of the time
      this house has stood, those four names were not written down anywhere you
      could read them while standing in front of it.`,
    sources: [YARD],
  },

  /* ----------------------------------------------------- Dexter Gate --- */
  {
    id: "dexter-arrival",
    subject: "dexter-gate",
    angle: "detail",
    depth: 1,
    arrival: true,
    tags: ["detail", "history"],
    look: "the inscription on the inner and outer faces of the arch",
    text: `Dexter Gate. This one is worth reading in both directions, because
      it says one thing on the way in and a different thing on the way out.`,
    sources: [GATES],
  },
  {
    id: "dexter-inscription",
    subject: "dexter-gate",
    angle: "history",
    depth: 2,
    requires: ["dexter-arrival"],
    tags: ["history", "ritual", "philosophy"],
    text: `Facing in, it reads: enter to grow in wisdom. Turn around and the
      other face reads: depart to serve better thy country and thy kind. It is
      the Class of eighteen ninety's gate, and it is the clearest statement
      anywhere on this campus of what the place thinks it is for. Note the
      order: you are told what to take on the way in, and what you owe on the
      way out. Students walking to and from Harvard Square pass under both
      halves of that sentence several times a day and almost certainly stop
      reading it after the first week.`,
    sources: [GATES],
  },

  /* --------------------------------------------------- Science Center --- */
  {
    id: "sci-arrival",
    subject: "science-center",
    angle: "present",
    depth: 1,
    arrival: true,
    tags: ["present", "architecture", "tech"],
    look: "the stepped concrete mass",
    text: `The big stepped concrete building is the Science Center, except it
      is not called that any more. In June twenty twenty-six Harvard renamed it
      Zimmer Hall after a hundred million dollar donation. Most people here will
      keep calling it the Science Center for another decade.`,
    sources: [SCI],
  },
  {
    id: "sci-polaroid-myth",
    subject: "science-center",
    angle: "mythbust",
    depth: 2,
    requires: ["sci-arrival"],
    tags: ["myth", "tech", "architecture"],
    text: `You will hear that the building is shaped like a Polaroid camera,
      because Polaroid's founder paid for it. Half of that is solidly true:
      Edwin Land, who invented instant photography, donated twelve and a half
      million dollars in nineteen sixty-eight specifically to build an
      undergraduate science centre, after Harvard had failed to fund one through
      the fifties and sixties. The camera resemblance is a campus legend, not
      anything the architect stated. Sert was building in his own idiom, and it
      looks like this everywhere else he used it. The story survives because the
      funding fact is real and the shape invites an explanation.`,
    sources: [SCI],
  },
  {
    id: "sci-sert",
    subject: "science-center",
    angle: "architecture",
    depth: 3,
    tags: ["architecture", "people", "modernism"],
    text: `The architect matters here. Josep Lluís Sert was a Catalan who
      worked with Le Corbusier, ran the international congress of modern
      architects, left Spain after the civil war, and became dean of Harvard's
      Graduate School of Design in nineteen fifty-three. Then he built pieces of
      the campus in a language deliberately opposed to the Georgian brick you
      just walked through. This building, finished in nineteen seventy-two and
      opened in seventy-three. Peabody Terrace down by the river. Holyoke
      Center, which is now the Smith Campus Center, in the middle of Harvard
      Square. The Center for the Study of World Religions. Steel, concrete, and
      a lot of daylight. Whether you like it or not, look at what it is arguing:
      the Yard says a university is a walled garden of brick boxes, and Sert
      says a university is an open frame you can extend. There is a real
      consequence to that argument too. This building was finished right as the
      nineteen seventy-three oil crisis hit, and it spent decades plagued by
      enormous energy bills, temperature control problems and roof leaks. The
      glass and concrete idiom assumed cheap energy, and then energy stopped
      being cheap.`,
    sources: [SCI],
  },
  {
    id: "sci-underpass",
    subject: "science-center",
    angle: "science",
    depth: 2,
    tags: ["urbanism", "tech", "systems"],
    text: `Something invisible happened here that mattered more than the
      building. Between nineteen sixty-six and sixty-eight, the stretch of
      Cambridge Street along the north edge of the Yard was dug down into a four
      lane vehicle underpass. That is why you can walk from the Yard to this
      plaza without crossing traffic. An architectural historian called it the
      most important improvement in Cambridge since Memorial Drive in the
      eighteen nineties. Burying a road is a very expensive way to make a
      pedestrian connection, and it is the reason this plaza works at all.`,
    sources: [SCI],
  },
  {
    id: "sci-instruments",
    subject: "science-center",
    angle: "science",
    depth: 3,
    tags: ["science", "tech", "history", "museum"],
    text: `Inside is the payoff for a story from the Old Yard. The Collection
      of Historical Scientific Instruments lives here: about twenty thousand
      objects going back to the fourteen hundreds. Its core is the apparatus
      Harvard bought to replace what burned in the seventeen sixty-four Harvard
      Hall fire, on Benjamin Franklin's advice. So the instruments Franklin
      specified are in this concrete building, a couple of hundred metres from
      the brick building where their predecessors were destroyed. For a long
      time the ground floor also held the Harvard Mark One, a room-sized
      electromechanical computer built in nineteen forty-four, sitting next to
      the main stairwell where anyone walking past could look at it. It has since
      been moved out to the new engineering complex in Allston. There is also a
      rooftop observatory with optical telescopes, which means Harvard's
      relationship with putting telescopes in buildings that are mostly not
      observatories has been going on continuously since seventeen twenty-two.
      And underneath you, secret from almost everyone who works here, is a
      gargantuan chilled water plant that cools much of the northern campus. One
      description calls it a magnificent Piranesi-like interior with the volume
      of Boston's Symphony Hall. A cathedral-sized machine room, under a plaza,
      full of cold water.`,
    sources: [SCI],
  },

  /* ---------------------------------------------------- Memorial Hall --- */
  {
    id: "memhall-arrival",
    subject: "memorial-hall",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture", "history"],
    look: "the tower and the polychrome roof",
    text: `Memorial Hall. High Victorian Gothic, eighteen seventies, and about
      as far from colonial restraint as a building can get. Henry James described
      it as three separate rooms in one shell.`,
    sources: [MEMHALL],
  },
  {
    id: "memhall-james",
    subject: "memorial-hall",
    angle: "architecture",
    depth: 2,
    requires: ["memhall-arrival"],
    tags: ["architecture", "literature"],
    text: `James's three divisions are still there. A theatre for ceremonies,
      which is Sanders Theatre. A vast refectory with a timbered roof and
      stained glass, like the halls of the colleges of Oxford, which is now
      Annenberg Hall where all the first-years eat. And the one he called most
      interesting: a chamber high, dim and severe, consecrated to the sons of
      the university who fell in the long Civil War. That is the Memorial
      Transept, and you walk through it to get between the other two.`,
    sources: [MEMHALL],
  },
  {
    id: "memhall-endowment",
    subject: "memorial-hall",
    angle: "history",
    depth: 2,
    tags: ["history", "money", "war"],
    text: `The money tells you how much this mattered. Between eighteen
      sixty-five and sixty-eight, an alumni committee of fifty raised three
      hundred and seventy thousand dollars for it. That was one twelfth of
      Harvard's entire endowment at the time. A twelfth of everything the
      university had, raised by graduates, for a memorial to a hundred and
      thirty-six dead.`,
    sources: [MEMHALL],
  },
  {
    id: "memhall-union-only",
    subject: "memorial-hall",
    angle: "history",
    depth: 3,
    tags: ["history", "war", "politics", "memory"],
    text: `Here is the thing about this building you should know before you go
      inside. The transept commemorates Harvard men who died defending the
      Union. Confederate deaths are not represented. Harvard had students and
      graduates on both sides, and this building made a decision about that. It
      has been described as a symbol of Boston's commitment to the Unionist
      cause and the abolitionist movement in America, and that is what it is:
      not a neutral monument to loss, but a statement about which loss counted.
      Reading the list is genuinely affecting. You see old New England names,
      Peabody, Wadsworth, Bowditch. You see Fletcher Webster, Daniel Webster's
      son. And you see an Edward Revere who died at Antietam and a Paul Revere
      who died at Gettysburg, both grandsons of the man on the horse. Compare
      this to the Class of eighteen fifty-seven gate on the south side of the
      Yard, paid for jointly by classmates who had fought against each other.
      Two monuments, a couple of hundred metres apart, twenty years apart,
      taking opposite positions on whether the other side gets remembered.`,
    sources: [MEMHALL, GATES],
  },
  {
    id: "memhall-sanders",
    subject: "memorial-hall",
    angle: "science",
    depth: 2,
    tags: ["acoustics", "architecture", "people"],
    text: `Sanders Theatre, in the far end, is the acoustically famous room. It
      was modelled on Christopher Wren's Sheldonian Theatre in Oxford, seats a
      thousand, and doubles as one of Harvard's largest classrooms. Winston
      Churchill, Theodore Roosevelt, Martin Luther King Junior and Mikhail
      Gorbachev have all spoken from that stage. It was paid for separately, by a
      forty thousand dollar bequest from a man named Charles Sanders, class of
      eighteen oh two, for a hall or theatre to be used on any public occasion,
      whether literary or festive.`,
    sources: [MEMHALL],
  },
  {
    id: "memhall-dining",
    subject: "memorial-hall",
    angle: "present",
    depth: 3,
    tags: ["present", "history", "food"],
    text: `The dining hall has had a strange career. Alumni Hall opened in
      eighteen seventy-four for formal dinners and was almost immediately turned
      into a dining commons, which it stayed for fifty years. In eighteen
      eighty-four a month of meals cost three dollars and ninety-seven cents. A
      magazine in eighteen ninety-three described throngs of men racing across
      the Yard at one o'clock from Harvard, Boylston and Sever, striving to
      reach the hall ahead of slower competitors for vacant seats at the
      overtaxed tables. Then student life moved south toward the river, and it
      closed in nineteen twenty-five. It spent decades hosting dances, exams,
      and at one point a rifle range in the basement. It reopened as Annenberg
      in nineteen ninety-six and now feeds the entire first-year class again.`,
    sources: [MEMHALL],
  },
  {
    id: "memhall-glass",
    subject: "memorial-hall",
    angle: "detail",
    depth: 2,
    tags: ["detail", "art", "craft"],
    look: "the stained glass, from inside if you can get in",
    text: `If you can get inside, the glass is the reason to do it.
      Twenty-two stained glass windows installed between eighteen seventy-nine
      and nineteen oh two, including several by John La Farge and several by
      Louis Comfort Tiffany's studios. La Farge was the one who worked out how to
      make opalescent glass do what he wanted, and this building was one of the
      places he did it. Two of the most important American glass makers of the
      period, in the same room, competing.`,
    sources: [MEMHALL],
  },

  /* ------------------------------------------------ Old Burying Ground --- */
  {
    id: "bury-arrival",
    subject: "old-burying-ground",
    angle: "history",
    depth: 1,
    arrival: true,
    tags: ["history"],
    look: "the slate headstones behind the fence",
    text: `The Old Burying Ground, opened in sixteen thirty-five. That is one
      year before the vote that founded Harvard. This graveyard is older than
      the university.`,
    sources: [BURY],
  },
  {
    id: "bury-presidents",
    subject: "old-burying-ground",
    angle: "history",
    depth: 2,
    requires: ["bury-arrival"],
    tags: ["history", "people"],
    text: `Eight presidents of Harvard College are buried in here, including
      the first two. Henry Dunster, president from sixteen forty to fifty-four,
      and Charles Chauncy after him. Also Stephen Daye, the first printer in
      colonial America, and Francis Dana, a Founding Father who was America's
      first envoy to Russia. It is a small patch of ground with a
      disproportionate amount of the seventeenth century in it.`,
    sources: [BURY],
  },
  {
    id: "bury-cicely",
    subject: "old-burying-ground",
    angle: "people",
    depth: 3,
    tags: ["people", "history", "race"],
    text: `There are two sets of graves here that matter more than the
      presidents. The first belongs to a woman recorded only as Cicely, who was
      enslaved in the household of a Harvard tutor. Her headstone is the oldest
      surviving gravestone of a Black person anywhere in the Americas. Not in
      Massachusetts. In the Americas. It is here, a few metres from the graves of
      the men who ran the college she was owned inside. The second is Cato
      Stedman and Neptune Frost, two Black soldiers of the Continental Army in
      seventeen seventy-five, commemorated on a sign on the fence along Garden
      Street. Standing here you can hold two facts at once: Harvard's first
      presidents are buried in this ground, and so is a woman they or their
      colleagues treated as property, and hers is the marker that turned out to
      be historically unique. Worth taking a minute over.`,
    sources: [BURY],
  },

  /* -------------------------------------------- Smith Campus Center --- */
  {
    id: "smith-arrival",
    subject: "smith-campus-center",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture"],
    look: "the tall concrete slab",
    text: `The tall concrete building is the Smith Campus Center, built in
      nineteen sixty-three as Holyoke Center. Same architect as the Science
      Center: Josep Lluís Sert.`,
    sources: [SCI, SQUARE],
  },
  {
    id: "smith-sert-pair",
    subject: "smith-campus-center",
    angle: "architecture",
    depth: 2,
    requires: ["smith-arrival"],
    tags: ["architecture", "urbanism", "modernism"],
    text: `Look at this and the Science Center as a pair, because they are the
      same argument made ten years apart, and this one is harder. Dropping a ten
      storey concrete slab into the middle of Harvard Square in nineteen
      sixty-three was an aggressive act, and it has been unpopular for most of
      its life. The ground floor was reworked recently into a public common room
      with a lot of glass and seating, which is an attempt to fix at street level
      what the massing does at skyline level. Whether that works is worth judging
      yourself while you are standing under it.`,
    sources: [SCI, SQUARE],
  },

  /* --------------------------------------------------- Harvard Square --- */
  {
    id: "square-arrival",
    subject: "harvard-square",
    angle: "present",
    depth: 1,
    arrival: true,
    tags: ["present", "urbanism"],
    text: `Harvard Square. Technically not a square, and the interesting thing
      about it is what is underneath: the subway station here was one of the
      first pieces of rapid transit in America.`,
    sources: [SQUARE],
  },
  {
    id: "square-kiosk",
    subject: "harvard-square",
    angle: "history",
    depth: 2,
    tags: ["history", "tech", "urbanism"],
    look: "the copper-roofed kiosk",
    text: `The little kiosk with the copper roof is a listed historic
      structure. It was built in nineteen twenty-eight as the entrance to the
      subway, then spent decades as a newsstand called Out of Town News, which
      stocked papers from everywhere and functioned as the square's noticeboard
      before the internet did that job. The subway itself reached here in
      nineteen twelve, on a line whose Boston section opened in eighteen
      ninety-seven and was the first subway in the United States.`,
    sources: [SQUARE],
  },
  {
    id: "square-pit",
    subject: "harvard-square",
    angle: "people",
    depth: 2,
    tags: ["people", "present", "subculture"],
    text: `The sunken area near the kiosk is known as the Pit. From the
      nineteen eighties onward it was the gathering place for the square's punk
      and skate and street kid scene, a genuinely separate culture operating
      within a few metres of one of the wealthiest universities on earth. It has
      been redesigned, policed, and softened repeatedly since. If you want the
      quick version of what has happened to Harvard Square over forty years:
      independent bookshops and record stores out, banks and chains in, and a
      long argument about the Pit running underneath all of it.`,
    sources: [SQUARE],
  },
];
