/**
 * Beats for the Old Yard — the western third of Harvard Yard, from Johnston
 * Gate across to University Hall.
 *
 * Voice: a curious generalist who cares how things work and is allergic to
 * tour-guide filler. Every beat earns its place with something specific.
 */

const GATES = "https://en.wikipedia.org/wiki/Gates_of_Harvard_Yard";
const YARD = "https://en.wikipedia.org/wiki/Harvard_Yard";
const MASS = "https://en.wikipedia.org/wiki/Massachusetts_Hall_(Harvard_University)";
const HARV = "https://en.wikipedia.org/wiki/Harvard_Hall";
const HOLDEN = "https://en.wikipedia.org/wiki/Holden_Chapel";
const UNIV = "https://en.wikipedia.org/wiki/University_Hall_(Harvard_University)";
const STATUE = "https://en.wikipedia.org/wiki/Statue_of_John_Harvard";
const DORMS =
  "https://en.wikipedia.org/wiki/List_of_Harvard_College_freshman_dormitories";

export const beats = [
  /* ------------------------------------------------ Johnston Gate --- */
  {
    id: "johnston-arrival",
    subject: "johnston-gate",
    angle: "history",
    depth: 1,
    arrival: true,
    tags: ["history", "architecture"],
    look: "the brick piers and the wrought iron",
    text: `This is Johnston Gate, and it is the front door. Finished in eighteen
      eighty-nine, and here is the thing that surprises people: it is the oldest
      gate in the fence, and the fence itself is younger than most of the
      buildings behind it.`,
    sources: [GATES, YARD],
  },
  {
    id: "johnston-peabody-myth",
    subject: "johnston-gate",
    angle: "mythbust",
    depth: 1,
    tags: ["myth", "detail"],
    text: `Quick correction to almost every photo caption ever written about
      this spot. The street behind you is not Massachusetts Avenue. It is
      Peabody Street. Mass Ave splits off a few metres away, and the two have
      been confused ever since.`,
    sources: [GATES, YARD],
  },
  {
    id: "johnston-fence",
    subject: "johnston-gate",
    angle: "architecture",
    depth: 2,
    tags: ["architecture", "history", "money"],
    text: `Look along the fence in either direction. There are twenty-seven
      gates in this perimeter, and every one of them was built after eighteen
      eighty. Before that the Yard just bled into the town. The fence is a
      Victorian decision, not a colonial one. Harvard spent the eighteen
      eighties and nineties drawing a hard line around itself, and graduating
      classes paid for the gates as reunion gifts. Which is why so many of them
      are named after a year rather than a person.`,
    sources: [GATES, YARD],
  },
  {
    id: "johnston-mckim",
    subject: "johnston-gate",
    angle: "architecture",
    depth: 2,
    requires: ["johnston-arrival"],
    tags: ["architecture", "people"],
    look: "how the brick piers are deliberately mismatched",
    text: `The design is by McKim, Mead and White, the most powerful architects
      in America at the time. They were asked for something that looked older
      than it was, and they delivered Georgian Revival: colonial brick, done
      knowingly. The whole gate cost about ten thousand dollars, paid for by
      Samuel Johnston, class of eighteen fifty-five. It is a fake antique by a
      firm that was very good at fake antiques.`,
    sources: [GATES],
  },
  {
    id: "johnston-sheriffs",
    subject: "johnston-gate",
    angle: "people",
    depth: 2,
    tags: ["history", "people", "ritual"],
    text: `One tradition to picture while you stand here. Every Commencement
      Day, the sheriffs of Middlesex and Suffolk counties arrive at the Yard on
      horseback, and by custom they come through this gate. The Middlesex
      sheriff then formally calls the ceremony to order. An actual law
      enforcement officer on an actual horse, opening a graduation. Nobody has
      found a good reason to stop.`,
    sources: [GATES],
  },
  {
    id: "johnston-1857",
    subject: "johnston-gate",
    angle: "history",
    depth: 3,
    tags: ["history", "people", "war"],
    text: `Since you are looking at a fence made of class gifts, there is one
      gate in it worth walking to. The Class of eighteen fifty-seven gate, on
      the south side. That class graduated four years before the Civil War, and
      its members went on to fight on both sides. When they built their gate,
      students from both sides helped pay for it. Harvard Magazine called it a
      very touching memorial to the unbroken bonds of friendship that this class
      had. It carries a Latin inscription from Horace. Compare that to Memorial
      Hall, just north of here, which commemorates Harvard's Civil War dead and
      pointedly lists only the Union ones. Same university, same war, two
      completely different decisions about who gets remembered, made about
      twenty years apart.`,
    sources: [GATES, "https://en.wikipedia.org/wiki/Memorial_Hall_(Harvard_University)"],
  },

  /* ------------------------------------------ Massachusetts Hall --- */
  {
    id: "mass-arrival",
    subject: "massachusetts-hall",
    angle: "history",
    depth: 1,
    arrival: true,
    tags: ["history", "architecture"],
    look: "the plain brick box on your right as you come through the gate",
    text: `That plain brick box is Massachusetts Hall, built between seventeen
      eighteen and seventeen twenty. It is the oldest surviving building at
      Harvard, and the second oldest academic building anywhere in the United
      States.`,
    sources: [MASS],
  },
  {
    id: "mass-architects",
    subject: "massachusetts-hall",
    angle: "architecture",
    depth: 2,
    tags: ["architecture", "history"],
    text: `Notice there is nothing decorative about it. No columns, no
      pediment, no gesture. That is because it was not designed by an architect.
      It was designed by two Harvard presidents, John Leverett and Benjamin
      Wadsworth, who needed to house sixty-four students and solved the problem
      directly. Thirty-two shared chambers, and sixty-four tiny private studies
      so that each student had one room to sleep in and one closet to think in.`,
    sources: [MASS],
  },
  {
    id: "mass-siege",
    subject: "massachusetts-hall",
    angle: "history",
    depth: 2,
    tags: ["history", "war"],
    text: `In seventeen seventy-five, during the Siege of Boston, six hundred
      and forty American soldiers were quartered in this building. It was
      designed for sixty-four. When they left, much of the interior woodwork had
      gone with them, along with the brass doorknobs. The Continental Army
      essentially stripped the place for parts.`,
    sources: [MASS],
  },
  {
    id: "mass-telescope",
    subject: "massachusetts-hall",
    angle: "science",
    depth: 2,
    tags: ["science", "tech", "history"],
    text: `Here is my favourite thing about this building. In seventeen
      twenty-two, a London merchant named Thomas Hollis shipped Harvard a
      quadrant and a twenty-four foot telescope. There was nowhere to put them,
      so they went into this dormitory, and Massachusetts Hall spent a stretch
      of the seventeen hundreds doubling as an informal observatory. A
      twenty-four foot refractor, in a student residence, in a colonial town of
      a few thousand people.`,
    sources: [MASS],
  },
  {
    id: "mass-residents",
    subject: "massachusetts-hall",
    angle: "people",
    depth: 3,
    tags: ["people", "history", "power"],
    text: `Run through who slept in this building. John Adams. Samuel Adams.
      John Hancock. Elbridge Gerry, whose name we now use as a verb for
      rigging electoral maps. James Otis, who argued against general search
      warrants and gave the Fourth Amendment its shape. That is a meaningful
      fraction of the American Revolution passing through one brick
      dormitory over a couple of decades. And it is still a dormitory. The
      president of Harvard has offices on the first two floors, and first-year
      students live on the fourth. Which means that today there are eighteen
      year olds sleeping directly above the president's office, in the oldest
      building on campus. Nobody planned that. It is just what happens when you
      keep using a building for three hundred years instead of turning it into a
      museum.`,
    sources: [MASS],
  },

  /* ------------------------------------------------- Harvard Hall --- */
  {
    id: "harvard-hall-arrival",
    subject: "harvard-hall",
    angle: "history",
    depth: 1,
    arrival: true,
    tags: ["history"],
    text: `Harvard Hall. Classrooms now, but this site is where the college
      kept its library, and it is where Harvard lost almost all of it in a
      single night.`,
    sources: [HARV],
  },
  {
    id: "harvard-hall-fire",
    subject: "harvard-hall",
    angle: "history",
    depth: 2,
    arrival: false,
    tags: ["history", "books"],
    text: `On the twenty-fourth of January, seventeen sixty-four, the earlier
      Harvard Hall burned. The library held about five thousand books. Four
      thousand five hundred of them were destroyed, including the personal
      library John Harvard had left the college. All but one of his books were
      gone. The scientific instruments went too.`,
    sources: [HARV],
  },
  {
    id: "harvard-hall-smallpox",
    subject: "harvard-hall",
    angle: "history",
    depth: 2,
    requires: ["harvard-hall-fire"],
    tags: ["history", "politics", "epidemiology"],
    text: `The reason the fire matters politically is who was in the room. A
      smallpox epidemic was running through Boston, so the Massachusetts General
      Court had relocated and was holding its sessions in Harvard Hall. The
      colonial legislature was meeting in the library when the library burned
      down. They accepted responsibility and funded the rebuilding, which is how
      a public epidemic response ended up paying for a university building.`,
    sources: [HARV],
  },
  {
    id: "harvard-hall-franklin",
    subject: "harvard-hall",
    angle: "science",
    depth: 3,
    requires: ["harvard-hall-fire"],
    tags: ["science", "tech", "people"],
    text: `Now the part I actually came here for. Harvard had to replace its
      scientific apparatus from nothing, and the person they took advice from
      was Benjamin Franklin. Franklin specified the replacement instruments,
      most of which were bought in London, with an emphasis on electrical
      demonstration equipment. This is Franklin at the height of his reputation
      as an electrician, telling a university what a physics teaching lab should
      contain. Those instruments survived, and they became the core of Harvard's
      Collection of Historical Scientific Instruments, which is now about twenty
      thousand objects going back to the fourteen hundreds and lives in the
      Science Center just north of here. So there is a direct line from a
      smallpox epidemic, to a fire, to Benjamin Franklin writing a shopping
      list, to a working museum of scientific instruments a few hundred metres
      away. Also worth noting: within two years of the fire, the rebuilt library
      was larger than the one that burned, funded by donors including John
      Hancock. Harvard got a better library out of the disaster, which is a
      pattern you will see repeat here.`,
    sources: [HARV, "https://en.wikipedia.org/wiki/Zimmer_Hall"],
  },

  /* ------------------------------------------------ Holden Chapel --- */
  {
    id: "holden-arrival",
    subject: "holden-chapel",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture", "history"],
    look: "the small building with the pale blue coat of arms in the gable",
    text: `The small one with the crest in the gable is Holden Chapel,
      seventeen forty-four. Third oldest building at Harvard, and in the
      nineteen thirties a national survey named it one of the finest examples of
      early colonial architecture in Massachusetts.`,
    sources: [HOLDEN],
  },
  {
    id: "holden-donor",
    subject: "holden-chapel",
    angle: "people",
    depth: 2,
    tags: ["people", "money", "history"],
    text: `The money came from Mrs Samuel Holden, the widow of a former
      Governor of the Bank of England, who offered four hundred pounds sterling
      in December seventeen forty-one. That is who the crest belongs to. A woman
      in London, connected to the most powerful bank in the world, paying for a
      chapel in a colonial village she would never see.`,
    sources: [HOLDEN],
  },
  {
    id: "holden-anatomy",
    subject: "holden-chapel",
    angle: "science",
    depth: 3,
    tags: ["science", "medicine", "history", "grim"],
    text: `Here is the turn this building takes. It worked as a chapel for
      morning and evening prayers from seventeen forty-four to seventeen
      seventy-two. Then Harvard Medical School was founded in seventeen
      eighty-three, and its founder John Warren used this building regularly for
      the next nineteen years. This is where medicine got taught, which in the
      late seventeen hundreds means this is where the dissections happened.
      Anatomy demonstrations, in a chapel roughly the size of a large living
      room, with no ventilation to speak of and no refrigeration at all.
      Medical schools of that era had a well documented supply problem, and it
      is not a coincidence that anatomy theatres tended to end up in buildings
      that were slightly out of the way. Today the same room is a rehearsal
      space for the Holden Choirs. Prayers, then cadavers, then choral music,
      in one small Georgian box.`,
    sources: [HOLDEN],
  },
  {
    id: "holden-sundial",
    subject: "holden-chapel",
    angle: "detail",
    depth: 1,
    tags: ["detail", "architecture"],
    look: "the sundial on the chapel",
    text: `Look for the sundial on the chapel. The inscription reads: on this
      moment hangs eternity. Which is a lot to put on a device that only works
      when the sun is out.`,
    sources: [HOLDEN],
  },

  /* --------------------------------------------------- Hollis Hall --- */
  {
    id: "hollis-arrival",
    subject: "hollis-hall",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture", "history"],
    text: `Hollis Hall, a first-year dormitory, and the other building that
      nineteen thirties survey singled out alongside Holden Chapel as some of
      the best colonial architecture in the state. Same master builder as the
      rebuilt Harvard Hall.`,
    sources: [DORMS, HOLDEN, HARV],
  },
  {
    id: "hollis-steps",
    subject: "hollis-hall",
    angle: "detail",
    depth: 2,
    tags: ["detail", "history", "physics"],
    look: "the dips worn into the granite doorsteps",
    text: `If you can get close to the doorsteps, look at the granite. There
      are hollows worn into them. The story students tell is that these are from
      cannonballs: soldiers quartered here during the Revolution heated
      cannonballs in the fireplaces for warmth, then dropped them on the steps
      on the way out. It is a good story and I cannot verify it, but the
      Continental Army genuinely did occupy the Yard's dormitories in seventeen
      seventy-five, so the setup is real even if the physics is doing a lot of
      work.`,
    sources: [DORMS],
  },

  /* ------------------------------------------------ University Hall --- */
  {
    id: "univ-arrival",
    subject: "university-hall",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture", "history"],
    look: "the white granite against all that brick",
    text: `University Hall, and notice what it is made of. White granite, in a
      yard that is otherwise entirely red brick. This is the building that broke
      the pattern, in eighteen fifteen.`,
    sources: [UNIV, YARD],
  },
  {
    id: "univ-bulfinch",
    subject: "university-hall",
    angle: "architecture",
    depth: 2,
    requires: ["univ-arrival"],
    tags: ["architecture", "people", "materials"],
    text: `The architect is Charles Bulfinch, Harvard class of seventeen
      eighty-one, the man who shaped the look of Federal Boston and later worked
      on the United States Capitol. The stone is white Chelmsford granite, and
      it was probably cut to size by prisoners at Charlestown Prison. Total cost
      sixty-five thousand dollars, of which the Commonwealth of Massachusetts
      paid fifty-three thousand. A state legislature funding a granite building
      for a private college, with convict labour dressing the stone.`,
    sources: [UNIV],
  },
  {
    id: "univ-portico",
    subject: "university-hall",
    angle: "detail",
    depth: 2,
    tags: ["architecture", "detail"],
    look: "the west facade, where a portico used to be",
    text: `The facade you are looking at is missing something. Soon after it
      was finished, a massive portico with stone pillars was added to this west
      front. In eighteen forty-two they took it off again. So the composition
      you are seeing was never quite the composition anyone designed. Also, the
      interior has been cut up repeatedly: dining commons on the ground floor
      until eighteen forty-nine, then classrooms, and a chapel upstairs that got
      partitioned in eighteen sixty-seven and then unpartitioned in eighteen
      ninety-six.`,
    sources: [UNIV],
  },
  {
    id: "univ-1969",
    subject: "university-hall",
    angle: "history",
    depth: 3,
    tags: ["history", "politics", "protest"],
    text: `This building is also where Harvard's most serious internal
      conflict played out. On the night of the eighth of April, nineteen
      sixty-nine, students occupied University Hall in protest against the
      Vietnam War and Harvard's involvement in it. They physically forced the
      administrators and staff out of the building. In the early hours of the
      tenth, police cleared it. Somewhere between one hundred and three hundred
      people were arrested and about fifty were injured. It fractured the
      faculty and it ended careers. The reason I point at this building rather
      than tell the story anywhere in the Yard is that occupations are always
      specific: you take the building where the deans are, because that is where
      the paperwork and the authority live. Students camped on this lawn again in
      twenty twenty over fossil fuel divestment, and again in twenty
      twenty-four over the war in Gaza. Same lawn, same reason. The Dean of the
      Faculty of Arts and Sciences and the Dean of Harvard College still work
      behind those windows.`,
    sources: [UNIV],
  },

  /* --------------------------------------------- John Harvard statue --- */
  {
    id: "statue-arrival",
    subject: "john-harvard-statue",
    angle: "mythbust",
    depth: 1,
    arrival: true,
    tags: ["myth", "art"],
    look: "the inscription on the plinth, and the bright toe",
    text: `The John Harvard statue. You will hear a guide nearby call this the
      Statue of Three Lies. That is the famous version. The real story is
      better, and the toe situation is worse than you think.`,
    sources: [STATUE],
  },
  {
    id: "statue-three-lies",
    subject: "john-harvard-statue",
    angle: "mythbust",
    depth: 2,
    requires: ["statue-arrival"],
    tags: ["myth", "history"],
    text: `The plinth reads: John Harvard, Founder, sixteen thirty-eight. The
      three objections are that it is not a likeness of John Harvard, that the
      colony's General Court voted the founding money rather than him, and that
      the vote came in sixteen thirty-six, not thirty-eight. All three are
      literally true. But sixteen thirty-eight is the year of John Harvard's
      bequest, and he is fairly described as a founder rather than the founder.
      So it is less a set of lies than a plaque being compressed.`,
    sources: [STATUE],
  },
  {
    id: "statue-face",
    subject: "john-harvard-statue",
    angle: "people",
    depth: 2,
    tags: ["art", "people", "history"],
    look: "the face",
    text: `Look at the face, because it belongs to someone else entirely. No
      image of John Harvard survives, so when Daniel Chester French took the
      commission in eighteen eighty-three he needed a model. He picked a Harvard
      student, Sherman Hoar, who was descended from a brother of Harvard's
      fourth president. French wrote that Hoar had more of what I want than
      anybody I know. Thirty years later the same sculptor made the seated
      Abraham Lincoln in the Lincoln Memorial. Same hands, same approach to a
      man in a chair.`,
    sources: [STATUE],
  },
  {
    id: "statue-toe",
    subject: "john-harvard-statue",
    angle: "mythbust",
    depth: 2,
    tags: ["myth", "present"],
    look: "the polished left shoe against the dark bronze",
    text: `Now the toe. The bronze is dark everywhere except the left shoe,
      which is polished bright. Visitors rub it for luck, believing they are
      joining a Harvard student tradition. There is no such tradition. Tour
      guides started encouraging it sometime in the nineteen nineties and it
      caught on so hard that one writer described the toe as gleaming almost
      throbbingly bright, as though from an excruciating inflammation of the
      bronze. There is a real tradition at this statue, though: graduating
      seniors take their caps off as they walk past it on Commencement Day.`,
    sources: [STATUE],
  },
  {
    id: "statue-relocation",
    subject: "john-harvard-statue",
    angle: "history",
    depth: 3,
    tags: ["history", "art", "humour"],
    text: `This statue has not always stood here, and the reason it moved is
      genuinely funny. It was unveiled in eighteen eighty-four at the western
      end of Memorial Hall, north of the Yard, on a triangular block called the
      Delta. Memorial Hall at that point contained the college dining hall. In
      nineteen twenty French, the sculptor, wrote to Harvard's president asking
      that it be relocated, and in nineteen twenty-four it was moved here, to
      face Harvard Hall, Massachusetts Hall and Johnston Gate. The Harvard
      Lampoon ran a drawing of John Harvard climbing down off his plinth,
      dragging his chair behind him, holding his nose, because he could not
      stand the smell of Mem any longer. The statue cost over twenty thousand
      dollars in eighteen eighty-four, something like seven hundred thousand
      today, paid for by a benefactor named Samuel James Bridge. And it has been
      a target ever since. Tarred in eighteen eighty-four, painted crimson after
      an athletic win in eighteen ninety, which produced newspaper headlines as
      far away as Indiana. In nineteen thirty-four the Lampoon photographed
      Yale's kidnapped bulldog mascot licking the statue's boots, which had been
      smeared with hamburger. And on the hundredth anniversary, the Lampoon's
      president, a student named Conan O'Brien, said they would probably stuff
      it with cottage cheese, maybe also with some chives.`,
    sources: [STATUE],
  },
];
