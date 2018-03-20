(==
    4
    5
    (lambda (v2)
        (letrec
            ((succ1
                (lambda (v0)
                    (* v0 2 SUCC))))
            (if v2
                (succ1 "true")
                (succ1 "false")))))
