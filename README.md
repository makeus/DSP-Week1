# DSP-Week1
This was an exercise project for [Distributed Systems Project Spring 2016](https://www.cs.helsinki.fi/courses/582665/2016/k/k/1). The object was to implement larport clock for undetermined amount of nodes. Lamport clock or Lamport clocks is a simple algorith to determine order of events on distributed systems. In short, every participating program maintains a clock value and syncs it with other from time to time.

## Running
To run the program run 
```
node app.js <configuration_file> <line>
```
Before this node_modules folder is required with bluebird dependency. To install, run
```
npm install
```

## Solution
To implement the lamport clock I decided to use NodeJs. This was chosen mostly because of familiarity but also because of the lightweight nature of the language.

### Implementation

The implementation starts with every node parsing the config file. Each node then start listening to its given port for UDP messages. Nodes send each other node a message indicating they are ready. Similar message is also responded with when a node receives said message. This ensures that nodes can be initiated at any time and order. 

When each node is ready and has received confirmation from other nodes the actual algorithm starts running. The algorithm is run every 200ms. Since the specification didn't specify how the lamport events should be triggered 200ms was decided to use to ensure the message have an impact. On each run, one of two events is randomly fired. These events are a local event and a message event. On local event, clock is randomly increased by 1-5. On message event random node that is running is sent the current clock with an UDP message. When a node receives a clock value from another node it compares the sent clock value to its, chooses the higher one and sets it as its own clock value with increased by one. When hundred events are performed, node sends all other nodes with a closing message indicating it no longer is running the algorithm. 

### Problems

During the development TCP was considered and tried. TCP however in node works as a stream instead of messsages which makes it inconvenient to use in messaging. UDP was chosen as an alternative.
