# CICBO-back-end
## Motivation: Digitalize your guest list
2020 kept the world on tenterhooks. During the pandemic, lots of restaurants, hotels, and other events need to keep a guest list.
CICBO (**C**ICBO **i**s a **C**orona **B**usiness **O**ptimizer) is a project that digitalizes this process to get rid of all the paper-work.

## Prerequisites
1. Nodejs must be installed
2. A mongo-database is needed \
   2.1 Create a mongo-database\
   2.2 Create 5 collections for the entities:
    - guest
    - staff
    - shift
    - shift-room
    - room 
    
   2.3 In *./secrets/* enter your settings and credentials in the provided JSON and rename it to *mongo-settings-with-credentials.json*

## Getting started
- Installing development environment + documentation: ```git clone https://github.com/ferdinand-dhbw/CICBO-back-end.git & npm i & gulp doc```
- Build: ```gulp build```
- Start server: ```gulp start``` and go to localhost:3000
- All together: ```git clone https://github.com/ferdinand-dhbw/CICBO-back-end.git & npm i & gulp```
- Different single steps: See ```gulp --tasks```

## Documentation
- The API can be found [here](https://raw.githubusercontent.com/lipilli/CICBO/api-spec/specs/api.yaml).
- Creating a documentation with typedoc is part of the build-process, but can be done manually with ```gulp doc```

## About
This is the back-end of CICBO &mdash;  **C**ICBO **i**s a **C**orona **B**usiness **O**ptimizer.\
It is a students-project by Deborah Djon and Ferdinand Koenig for Web Engineering 2 (3<sup>rd</sup> semester in the course _Computer Science_) at the Cooperative State University Stuttgart (DHBW Stuttgart).\
Lecturer: Danny Amor

## Extras
- Unlock the true potential with a suited [front-end](https://github.com/lipilli/CICBO).
- The different entities are checked by JSON-schema. These are accessible via e.g. ```GET [url]/schema/shift.json``` or by simply browsing to this path.

## Github
The project is available on https://github.com/ferdinand-dhbw/CICBO-back-end
